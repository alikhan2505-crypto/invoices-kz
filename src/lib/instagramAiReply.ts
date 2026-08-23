import Anthropic from '@anthropic-ai/sdk'

// No test file: this is a live network call to a paid API, matching this
// codebase's existing convention (e.g. sendTelegramNotification in
// telegramNotify.ts is likewise untested — only pure logic like
// parseStartToken gets a colocated test).
export async function generateAiReply(params: {
  incomingText: string
  fromUsername: string
  postCaption?: string
  source: 'comment' | 'dm'
  // Prior exchanges with this same DM sender (oldest first), so the model
  // doesn't re-greet someone it already has an ongoing conversation with.
  // Only ever populated for source: 'dm' -- a comment thread under a post
  // isn't a continuous conversation the same way.
  conversationHistory?: { incoming: string; reply: string }[]
  businessContextLine: string
  // Structured collect-field keys the multi-tenant tenant pipelines
  // (webhookHandler.ts and its Telegram/WhatsApp twins) pass when the
  // agent has ai_agents.collect_fields configured -- businessContextLine
  // is just the flattened prose line the model reads, this is the
  // structured {key,label} list needed to ask for AND parse a structured
  // extraction back out in the SAME response (no second billable call).
  // Absent or empty: the extraction instruction/format line is omitted
  // entirely, so callers that don't opt in (the single-tenant invoices.kz
  // Instagram bot, any test) get byte-for-byte the same prompt and cost as
  // before this feature existed.
  collectFieldsToExtract?: { key: string; label: string }[]
  // Present only for a photo message -- Claude's vision handles it, and
  // template matching is skipped upstream (callers never look for a
  // template match when this is set). Absent for every existing caller, so
  // the Anthropic request stays byte-for-byte the string it is today.
  image?: { base64: string; mediaType: string }
}): Promise<{ replyText: string; urgent: boolean; extractedFields?: Record<string, string> }> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured')

  const client = new Anthropic({ apiKey })
  const hasExtraction = !!params.collectFieldsToExtract && params.collectFieldsToExtract.length > 0

  const contextLine = params.source === 'comment'
    ? (params.postCaption
        ? `Комментарий оставлен под постом с подписью: "${params.postCaption}"`
        : 'Это комментарий под постом.')
    : 'Это личное сообщение (DM).'

  const historyBlock = params.conversationHistory?.length
    ? `\n\nПредыдущая переписка с этим же человеком (от старых сообщений к новым):\n${params.conversationHistory
        .map(h => `Клиент: "${h.incoming}"\nТы уже ответил(а): "${h.reply}"`)
        .join('\n\n')}\n\nНе здоровайся заново и не повторяй то, что уже сказал(а) выше — продолжай диалог естественно, как живой человек, помнящий контекст.`
    : ''

  // Comments are public -- anyone reading the post sees them, so a long
  // detailed answer clutters the thread. DMs are private, so a fuller
  // answer is fine there.
  const lengthInstruction = params.source === 'comment'
    ? 'Это ПУБЛИЧНЫЙ комментарий под постом, его увидят все читающие пост. Ответь МАКСИМАЛЬНО коротко — одно короткое предложение, не длиннее ~12 слов. Не объясняй детали (цены, сроки, настройку) в комментарии — вместо этого вежливо предложи написать в личные сообщения (директ) для подробностей.'
    : 'Это личное сообщение — можно ответить чуть подробнее (2-3 предложения), но не растягивай текст.'

  // Only built when the caller opted in (hasExtraction) -- an empty string
  // otherwise, so it interpolates into the prompt as nothing and the
  // request is byte-for-byte identical to before this feature existed.
  const extractionAskLine = hasExtraction
    ? `\n\nТакже постарайся извлечь данные клиента, которые нужно собрать: ${params.collectFieldsToExtract!.map(f => `${f.label} (ключ "${f.key}")`).join(', ')}. Включай поле в извлечение ТОЛЬКО если клиент явно и дословно (или почти дословно) сам назвал его значение -- в этом сообщении или раньше в этом же диалоге. Никогда не угадывай, не придумывай и не бери значение из своего собственного ответа -- источником может быть только то, что написал клиент. Если клиент не называл поле, не включай его вовсе.`
    : ''
  const extractedFormatLine = hasExtraction
    ? `\n<<<EXTRACTED>>>{"ключ":"значение"}<<<END>>> -- JSON с извлечёнными полями по правилам выше (пустой объект {}, если клиент пока ничего из списка не сообщил)`
    : ''

  // Photos have no meaningful "написал: ..." line (incomingText is a
  // caption or the '[Фото]' placeholder the caller sets when there's none)
  // -- phrase it as what actually happened so the model isn't confused by
  // a placeholder string sitting where a real quote usually goes.
  const messageLine = params.image
    ? (params.incomingText && params.incomingText !== '[Фото]'
        ? `Пользователь ${params.fromUsername} прислал(а) фото с подписью: "${params.incomingText}"`
        : `Пользователь ${params.fromUsername} прислал(а) фото без подписи.`)
    : `Пользователь ${params.fromUsername} написал: "${params.incomingText}"`

  const textContent = `${params.businessContextLine} ${contextLine}${historyBlock}

${messageLine}

${lengthInstruction} Ответь на ТОМ ЖЕ ЯЗЫКЕ, на котором написал пользователь (например, казахский → отвечай на казахском, английский → на английском, русский → на русском). Пиши вежливо и дружелюбно. Не придумывай факты о ценах, сроках или функциях, которых ты не знаешь — в таком случае вежливо предложи написать в директ для уточнения деталей.${extractionAskLine}

Также оцени: сигнализирует ли сообщение о срочности или негативе (явно злой/раздражённый тон, жалоба, угроза уйти/оставить плохой отзыв, требование вернуть деньги, срочная просьба связаться с человеком) — обычный вопрос про цены/функции НЕ считается срочным.

Верни ответ СТРОГО в этом формате, ничего больше:
URGENT: yes ИЛИ no
REPLY: текст ответа без кавычек и пояснений${extractedFormatLine}`

  const message = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    // max_tokens is a ceiling, not a cost -- billing is by tokens actually
    // generated, so raising it here only when extraction is requested costs
    // nothing extra for a normal-length reply. It exists so a reply near the
    // old 300-token cap plus a multi-field <<<EXTRACTED>>> JSON block can't
    // get cut off before its closing <<<END>>> delimiter, which would make
    // parseExtractedFieldsBlock silently find no match at all.
    max_tokens: hasExtraction ? 500 : 300,
    messages: [{
      role: 'user',
      // A caller that never passes `image` gets the exact same plain-string
      // content this request has sent since before this feature existed.
      content: params.image
        ? [
            {
              type: 'image' as const,
              source: {
                type: 'base64' as const,
                // Validated by the caller (mediaLimits.ts's
                // isImageWithinLimits) before this function is ever called
                // with an image -- safe to narrow here.
                media_type: params.image.mediaType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
                data: params.image.base64,
              },
            },
            { type: 'text' as const, text: textContent },
          ]
        : textContent,
    }],
  })

  const textBlock = message.content.find(block => block.type === 'text')
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('AI reply generation returned no text')
  }
  const parsed = parseUrgentReply(textBlock.text.trim())
  if (!hasExtraction) return parsed

  const { cleanText, extractedFields } = parseExtractedFieldsBlock(parsed.replyText)
  return { replyText: cleanText, urgent: parsed.urgent, extractedFields }
}

// Tolerant of the model not matching the requested format exactly -- if no
// REPLY: marker is found, the whole response is treated as the reply text
// and urgency defaults to false (safe degradation: worst case a genuinely
// urgent message doesn't get flagged, rather than a parsing glitch blocking
// the reply entirely).
function parseUrgentReply(text: string): { replyText: string; urgent: boolean } {
  const replyMatch = text.match(/REPLY:\s*([\s\S]*)/i)
  if (!replyMatch) return { replyText: text, urgent: false }
  const urgentMatch = text.match(/URGENT:\s*(yes|no)/i)
  return {
    replyText: replyMatch[1].trim(),
    urgent: urgentMatch?.[1].toLowerCase() === 'yes',
  }
}

// Parses out the <<<EXTRACTED>>>{...}<<<END>>> delimiter block
// generateAiReply asks the model to append after REPLY: when
// collectFieldsToExtract is non-empty (see extractedFormatLine above).
// Defensive by design: a missing block, malformed JSON, or a non-object/
// array payload all resolve to "no extraction" rather than throwing -- a
// parsing hiccup must never break the reply itself (same tolerant spirit as
// parseUrgentReply above). The delimited block is always stripped out of
// cleanText when found, even on a parse failure, so the customer never sees
// raw JSON in their reply either way. Exported for its own colocated test
// (this module's network-calling exports stay untested, per this file's
// documented convention -- see the top-of-file comment -- but this is pure
// logic, the same exception parseStartToken gets in telegramNotify.ts).
export function parseExtractedFieldsBlock(text: string): { cleanText: string; extractedFields?: Record<string, string> } {
  const match = text.match(/<<<EXTRACTED>>>([\s\S]*?)<<<END>>>/)
  if (!match) return { cleanText: text }
  const cleanText = (text.slice(0, match.index) + text.slice(match.index! + match[0].length)).trim()

  try {
    const parsed = JSON.parse(match[1].trim())
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return { cleanText }
    const extractedFields: Record<string, string> = {}
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === 'string' && value.trim()) extractedFields[key] = value.trim()
      else if (typeof value === 'number' || typeof value === 'boolean') extractedFields[key] = String(value)
    }
    return Object.keys(extractedFields).length > 0 ? { cleanText, extractedFields } : { cleanText }
  } catch {
    return { cleanText }
  }
}

// Used to turn an admin-approved AI reply into a reusable template (see
// telegram-webhook's ig_reply_send handler). Deliberately told to avoid a
// bare generic greeting as a standalone trigger -- a live incident
// (2026-08-11) showed a template whose own reply text started with the
// same word as its trigger ("Здравствуйте!") can match its own replies
// and self-loop. That specific failure mode is now also blocked
// structurally (webhook route skips our own account's comments), but this
// prompt avoids growing more templates with the same generic-trigger shape.
export async function extractTriggerWords(incomingText: string): Promise<string[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured')

  const client = new Anthropic({ apiKey })

  const message = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 60,
    messages: [{
      role: 'user',
      content: `Сообщение от клиента: "${incomingText}"

Выдели 1-3 коротких ключевых слова или фразы (каждая по 1-3 слова, НА ТОМ ЖЕ ЯЗЫКЕ, на котором написано само сообщение — не переводи), по которым это сообщение можно узнать среди похожих будущих сообщений. Не используй голые приветствия/вводные слова отдельным пунктом (например одно "здравствуйте"/"сәлем"/"hello"). Верни только список через запятую, без нумерации и пояснений.`,
    }],
  })

  const textBlock = message.content.find(block => block.type === 'text')
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('Trigger word extraction returned no text')
  }
  return textBlock.text.trim().split(',').map(w => w.trim().toLowerCase()).filter(Boolean).slice(0, 3)
}
