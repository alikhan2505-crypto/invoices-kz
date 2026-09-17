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
  if (salon.ratingBadge) lines.push(`Рейтинг: ${salon.ratingBadge}`)

  const services = salon.services
    .map((s) => `- ${s.name} — ${s.price}${s.duration ? `, ${s.duration}` : ''}`)
    .join('\n')

  let result = `${lines.join('\n')}\n\nУслуги и цены:\n${services}`

  if (salon.reviews?.length) {
    const reviews = salon.reviews.map((r) => `- «${r}»`).join('\n')
    result += `\n\nНастоящие отзывы клиентов (реальные цитаты, вставлены владельцем вручную -- не перефразируй смысл, можно немного сократить длинную цитату, но не менять её):\n${reviews}`
  }

  return result
}

const SYSTEM = `Ты — арт-директор уровня топового брендингового агентства, верстаешь одностраничные лендинги для салонов красоты в Казахстане. Планка — как у премиальных референсов на Awwwards/21st.dev, не типовой AI-шаблон. Если результат выглядит как "ещё один сгенерированный лендинг" — это провал задачи.

Жёсткие ограничения (не нарушать):
- Один самодостаточный HTML-документ: <!DOCTYPE html>, <html lang="ru">, все стили в одном теге <style> внутри <head>.
- Никакого JavaScript: ни <script>, ни onclick и подобных атрибутов. Страница отдаётся с CSP, который скрипты не выполнит. Все анимации и интерактивность — ТОЛЬКО через CSS (см. ниже, это не помеха для качества, а именно так делают премиальные CSS-only лендинги).
- Никаких <form>: заявка идёт ссылкой wa.me или tel:.
- Шрифты — только через <link> на fonts.googleapis.com. Картинок нет: вместо фото используй типографику, цветные блоки, CSS-градиенты и сгенерированные CSS-фигуры (никаких <img>, background-image с внешними URL или SVG-иконок из чужих CDN).
- Адаптивность обязательна: на телефоне читается без горизонтальной прокрутки, ни один элемент не вылезает за экран на ширине 360px.
- Все тексты на русском, без выдуманных фактов: используй только переданные данные. Не придумывай отзывы, награды, годы работы и количество клиентов от себя. Если в данных салона ниже есть блок "Настоящие отзывы клиентов" — это реальные цитаты, вставленные владельцем вручную (например, скопированы с 2ГИС): используй их в секции отзывов дословно или с лёгким сокращением, не меняя смысл. Если блока с отзывами нет — секцию отзывов не делай вообще (плейсхолдер вида "Отзывы наших клиентов" без единой цитаты хуже, чем отсутствие секции). Если передан "Рейтинг" — вынеси его как реальную цифру (например, бейдж "4.6 ★ · 209 оценок"), не пересчитывай и не округляй иначе, чем дано.

Ремесло, которое отличает премиум от типового AI-лендинга:

1. Типографика — не system-ui одним весом. Подбирай контрастную пару: выразительный дисплейный шрифт для заголовков (Google Fonts: например Fraunces, Unbounded, Manrope Extrabold, Bodoni Moda, Playfair Display — в зависимости от паттерна) + нейтральный текстовый для основного текста. Заголовок героя — крупный и уверенный через clamp(), например font-size: clamp(2.75rem, 6vw + 1rem, 5.5rem); letter-spacing чуть отрицательный на крупных заголовках (-0.02em).

2. Глубина и свет, а не плоские блоки:
   - Многослойные мягкие тени вместо дефолтного box-shadow: box-shadow: 0 1px 2px rgba(0,0,0,.06), 0 8px 24px -8px rgba(0,0,0,.18), 0 24px 48px -16px rgba(0,0,0,.16);
   - Glassmorphism на карточках/навигации поверх градиентного фона: background: rgba(255,255,255,.08); backdrop-filter: blur(16px); border: 1px solid rgba(255,255,255,.14);
   - Аура/меш-градиент на фоне (несколько мягких radial-gradient разных цветов, размытых и полупрозрачных) вместо однотонной заливки секции.
   - Градиентный текст на акцентных словах: background: linear-gradient(135deg, colorA, colorB); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;

3. CSS-анимации — обязательны, без единой строчки JS:
   - Плавное появление героя при загрузке: @keyframes fadeInUp { from { opacity:0; transform: translateY(24px); } to { opacity:1; transform: translateY(0); } } — применить к заголовку, подзаголовку и кнопке с animation-delay в шахматном порядке (0s, .15s, .3s).
   - Scroll-reveal секций без JavaScript через нативный CSS Scroll-Driven Animations (Chrome/Edge поддерживают нативно): секция { animation: reveal linear; animation-timeline: view(); animation-range: entry 0% cover 30%; } @keyframes reveal { from { opacity:0; transform: translateY(40px); } to { opacity:1; transform: translateY(0); } } — браузеры без поддержки просто покажут секцию сразу видимой (это нормальный, ожидаемый fallback, дополнительных @supports-блоков не нужно).
   - Уважай @media (prefers-reduced-motion: reduce) — внутри него глуши длинные анимации (animation-duration: .01ms !important).
   - Микровзаимодействия на hover у кнопок и карточек услуг: transition transform/box-shadow 0.25s cubic-bezier(.16,1,.3,1); на hover — transform: translateY(-2px) scale(1.02) и усиление тени/свечения. Кнопка записи — никогда не плоская, всегда pill-формы (border-radius: 999px) с мягким свечением.

4. Композиция секций, не одна колонка сверху вниз:
   - Герой — не текст по центру на пустом фоне: добавь визуальный вес асимметрией (крупный заголовок слева, декоративная композиция из перекрывающихся полупрозрачных карточек/цветных блоков с ценами или именами мастеров справа), или полноэкранный градиентный фон с крупной типографикой внахлёст.
   - Услуги — не таблица по умолчанию: карточки с разным уровнем приподнятости (тень), либо построчный список с крупной ценой и тонкой разделительной линией с градиентом, а не сплошной border.
   - Чёткий ритм секций: чередуй фон (тёмная секция → светлая → акцентный градиент), а не одна и та же заливка до конца страницы.

5. Палитра — по паттерну (см. описание паттерна в запросе), но всегда с одним ярким акцентным цветом, который повторяется в градиентах, обводках кнопок и hover-состояниях — не десять случайных цветов.

Итог: это НЕ шаблон с подставленными полями, это авторская композиция под конкретный салон, с настоящей типографической иерархией, светом и движением.

В ответ отдай только HTML-документ, без пояснений.`

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
