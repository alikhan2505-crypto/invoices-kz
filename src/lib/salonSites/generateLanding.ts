import Anthropic from '@anthropic-ai/sdk'
import { findPattern, VARIANT_DIRECTIONS } from './patterns'
import { sanitizeLandingHtml, extractHtmlDocument } from './sanitizeHtml'
import type { SalonData } from './types'

// No test file: live network call to a paid API, matching this codebase's
// existing convention (e.g. generateAiReply in instagramAiReply.ts). Тестами
// покрыт разбор ответа -- см. sanitizeHtml.test.ts.

function describeSalon(salon: SalonData): string {
  const lines = [
    `Название: ${salon.name}`,
    `Город: ${salon.city}`,
    `Адрес: ${salon.address}`,
    `Телефон: ${salon.phone}`,
  ]
  if (salon.whatsapp) lines.push(`WhatsApp: ${salon.whatsapp}`)
  if (salon.instagram) lines.push(`Instagram: ${salon.instagram}`)
  if (salon.workingHours) lines.push(`Часы работы: ${salon.workingHours}`)
  if (salon.about) lines.push(`О салоне: ${salon.about}`)
  if (salon.masters?.length) lines.push(`Мастера: ${salon.masters.join(', ')}`)
  if (salon.styleNotes) lines.push(`Пожелания по стилю: ${salon.styleNotes}`)

  const services = salon.services
    .map((s) => `- ${s.name} — ${s.price}${s.duration ? `, ${s.duration}` : ''}`)
    .join('\n')

  return `${lines.join('\n')}\n\nУслуги и цены:\n${services}`
}

const SYSTEM = `Ты верстаешь одностраничные лендинги для салонов красоты в Казахстане.

Требования к результату:
- Один самодостаточный HTML-документ: <!DOCTYPE html>, <html lang="ru">, все стили в одном теге <style> внутри <head>.
- Никакого JavaScript: ни <script>, ни onclick и подобных атрибутов. Страница отдаётся с CSP, который скрипты не выполнит.
- Никаких <form>: заявка идёт ссылкой wa.me или tel:.
- Шрифты — только через <link> на fonts.googleapis.com. Картинок нет: вместо фото используй типографику, цветные блоки и CSS-градиенты.
- Адаптивность обязательна: на телефоне читается без горизонтальной прокрутки.
- Все тексты на русском, без выдуманных фактов: используй только переданные данные. Не придумывай отзывы, награды, годы работы и количество клиентов.
- В ответ отдай только HTML-документ, без пояснений.`

export async function generateLandingVariant({
  salon,
  patternId,
  variantNo,
}: {
  salon: SalonData
  patternId: string
  variantNo: number
}): Promise<{ html: string; direction: string }> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured')

  const pattern = findPattern(patternId)
  if (!pattern) throw new Error(`unknown pattern: ${patternId}`)

  const direction = VARIANT_DIRECTIONS[variantNo - 1]
  if (!direction) throw new Error(`variantNo must be 1..${VARIANT_DIRECTIONS.length}`)

  const client = new Anthropic({ apiKey })

  // Лендинг -- длинный вывод, поэтому поток: иначе запрос упирается в таймаут
  // HTTP раньше, чем модель успевает дописать документ.
  const stream = client.messages.stream({
    model: 'claude-opus-5',
    max_tokens: 32000,
    thinking: { type: 'adaptive' },
    output_config: { effort: 'medium' },
    system: SYSTEM,
    messages: [{
      role: 'user',
      content: `Свёрстай лендинг салона красоты.

ДАННЫЕ САЛОНА
${describeSalon(salon)}

ПАТТЕРН «${pattern.label}»
${pattern.brief}

НАПРАВЛЕНИЕ ЭТОГО ВАРИАНТА
${direction}`,
    }],
  })

  const message = await stream.finalMessage()

  if (message.stop_reason === 'refusal') {
    throw new Error('generateLandingVariant: модель отказалась выполнять запрос')
  }

  const text = message.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('')

  const html = sanitizeLandingHtml(extractHtmlDocument(text))
  if (!html.toLowerCase().includes('<html')) {
    throw new Error('generateLandingVariant: в ответе нет HTML-документа')
  }

  return { html, direction }
}
