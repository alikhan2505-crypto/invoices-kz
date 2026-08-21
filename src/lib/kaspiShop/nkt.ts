import Anthropic from '@anthropic-ai/sdk'

// Каталог НКТ (Национальный каталог товаров) -- background: research done
// 2026-08-21 before writing any of this file. Findings, so a future editor
// doesn't have to re-derive them:
//
// - A real government system and a real REST API for it exist:
//   nationalcatalog.kz is the National Catalog of Goods itself; its API docs
//   are referenced at nationalcatalog.kz/gwp/docs and nct.kz/rest/docs
//   (per multiple independent secondary sources -- pro1c.kz, birsan.kz).
//   Access requires creating your OWN personal account on nationalcatalog.kz
//   and generating an API key there ("Личный кабинет" -> "API Keys" ->
//   "Create Key") -- this is a *separate* account/credential system from
//   Kaspi entirely, not something reachable via kaspi.kz session cookies.
// - Fetching nationalcatalog.kz/gwp/docs directly (2026-08-21) returned no
//   usable content -- it appears to be a JS-rendered SPA, not a static/
//   crawlable page -- so no real endpoint path, request shape, or response
//   shape could be confirmed firsthand. docs.npck.kz, a same-sounding but
//   DIFFERENT government identity/fintech platform (FinID, e-sign, Open
//   Banking), was also checked and confirmed to be the wrong system
//   entirely -- it has nothing to do with product registration.
// - Kaspi's own partner guide (guide.kaspi.kz/partner/ru/shop/goods/general/
//   q4575, fetched 2026-08-21) confirms the Kaspi seller cabinet does NOT
//   host NTIN submission itself: sellers can attach an EXISTING barcode/NTIN
//   already in НКТ from within the Kaspi cabinet, but "если штрихкода нет в
//   базе... зарегистрируйте товар в НКТ" -- i.e. registering a genuinely new
//   product happens on nationalcatalog.kz, a separate site, not inside
//   mc.shop.kaspi.kz. So there is nothing in cabinetApi.ts's authenticated
//   GraphQL facade to extend for this -- confirmed by the guide's own text,
//   not just an absence of an observed call.
// - Third-party resellers (kazntin.kz, aww.kz, algatop.kz, okto.kz) exist
//   specifically to submit on a seller's behalf; kazntin.kz's own FAQ
//   (fetched 2026-08-21) describes their own product as "ИИ заполняет поля,
//   подбирает ТН ВЭД и ОКТРУ" -- i.e. even a company built around this
//   problem stops at AI-assisted suggestion + doing the filing themselves
//   as a paid service, not publishing a simple documented self-serve API a
//   third party like this codebase could integrate against on faith.
//
// Conclusion: no real, confirmed, automatable submission path exists that
// this codebase can reach (neither via Kaspi's session nor a verified
// nationalcatalog.kz API request/response shape). Per this repo's own
// precedent for unconfirmed integrations (see waybills.ts's top comment),
// building a fake-looking "submit" call here would be worse than not having
// one. So: the AI suggestion below IS real and functional. The "submission"
// step in the API route and page is a manual-instruction fallback only --
// it self-reports a status change the seller makes after filing themselves
// at nationalcatalog.kz, and never calls any government or Kaspi endpoint.

export type NktSuggestion = {
  oktruCode: string | null
  oktruName: string | null
  tnvedCode: string | null
  reasoning: string
  confident: boolean
}

// This is a support-the-human suggestion, not an authoritative classifier --
// the model is explicitly told to say it isn't sure rather than fabricate a
// confident-looking code, matching suggestPricingRule.ts's same
// starting-point-not-a-decision framing for AI output in this feature area.
export async function suggestNktCodes(params: {
  productName: string
  brand?: string | null
  kaspiCategory?: string | null
}): Promise<NktSuggestion> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured')

  const client = new Anthropic({ apiKey })

  const contextLines = [
    `Название товара: "${params.productName}"`,
    params.brand ? `Бренд: ${params.brand}` : null,
    params.kaspiCategory ? `Категория на Kaspi.kz: ${params.kaspiCategory}` : null,
  ].filter(Boolean).join('\n')

  const message = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 300,
    messages: [{
      role: 'user',
      content: `Для регистрации товара в Национальном каталоге товаров Казахстана (НКТ) нужно предложить код категории ОКТРУ (Общий классификатор технико-экономической и социальной информации) и код ТН ВЭД (таможенный код).

${contextLines}

Если ты УВЕРЕН в подходящем коде -- предложи конкретный код и название категории ОКТРУ, а также код ТН ВЭД (обычно 10 цифр). Если ты НЕ уверен (товар описан слишком расплывчато, есть несколько правдоподобных категорий, или ты не знаешь точного кода) -- честно ответь "не уверен" вместо того, чтобы придумывать похожий на правду код. Лучше вернуть пусто, чем ошибочный код.

Ответь СТРОГО в этом формате, ничего больше:
CONFIDENT: yes или no
OKTRU_CODE: <код или "не уверен">
OKTRU_NAME: <название категории на русском или "не уверен">
TNVED_CODE: <код или "не уверен">
REASONING: <одно-два предложения на русском, объясняющие выбор или причину неуверенности>`,
    }],
  })

  const block = message.content.find(b => b.type === 'text')
  const text = block && block.type === 'text' ? block.text : ''

  const confidentMatch = text.match(/CONFIDENT:\s*(yes|no)/i)
  const oktruCodeMatch = text.match(/OKTRU_CODE:\s*(.+)/i)
  const oktruNameMatch = text.match(/OKTRU_NAME:\s*(.+)/i)
  const tnvedCodeMatch = text.match(/TNVED_CODE:\s*(.+)/i)
  const reasoningMatch = text.match(/REASONING:\s*([\s\S]+)/i)

  const confident = confidentMatch?.[1].toLowerCase() === 'yes'

  // "не уверен" (in any case/spacing) or an empty capture both collapse to
  // null -- the UI must never show a placeholder string as if it were a
  // real code.
  function cleanOrNull(raw: string | undefined): string | null {
    if (!raw) return null
    const v = raw.trim().replace(/^"|"$/g, '')
    if (!v || /не\s*уверен/i.test(v)) return null
    // Regex captures to end-of-line for single-line fields -- REASONING is
    // the last field and captures everything after it including any
    // trailing content, so cut other fields' captures at their own line.
    return v.split('\n')[0].trim()
  }

  return {
    oktruCode: cleanOrNull(oktruCodeMatch?.[1]),
    oktruName: cleanOrNull(oktruNameMatch?.[1]),
    tnvedCode: cleanOrNull(tnvedCodeMatch?.[1]),
    reasoning: reasoningMatch ? reasoningMatch[1].trim() : '',
    confident,
  }
}
