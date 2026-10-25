// Единое правило срабатывания триггерного слова шаблона/сценария ответа
// (ai_agent_reply_templates, ai_agent_flows, instagram_reply_templates).
// Общее для всех матчеров, чтобы они не расходились:
// - findTemplateMatch (src/lib/aiAgent/webhookHandler.ts) -- WhatsApp/Telegram/
//   сайт/внешний API/тестовый чат;
// - findFlowTriggerMatch (src/lib/aiAgent/flow.ts);
// - findMatchingTemplate (src/lib/instagramReplyMatch.ts) -- Instagram.
// Стоп-фразы сюда НЕ относятся: у них своя логика (src/lib/aiAgent/stopPhrases.ts).
//
// Правило:
// - триггер длиннее SHORT_TRIGGER_MAX символов -- как раньше, обычная подстрока
//   без учёта регистра (обратная совместимость со всеми существующими шаблонами);
// - короткий триггер (до 3 символов после trim) -- только с НАЧАЛА слова: прямо
//   перед ним не должно стоять буквы или цифры. Окончание после него допустимо:
//   «бин» ловит «БИН», «бина», «бине», но не «кабинет», «комбинация», «Робин».
//   Иначе короткое слово срабатывало бы внутри любых длинных.
// - пустой/пробельный триггер не срабатывает никогда.
// Явные режимы (25.10.2026, кодовые слова из роликов, ловить сообщение по слову
// целиком, а не кусок чужого слова); префикс пишется в самом триггере:
// - «=товар» -- сообщение целиком равно слову (без учёта регистра; знаки
//   препинания, пробелы и эмодзи по краям не мешают: «Товар!», «  товар 👍»).
//   Для коротких или ходовых слов («акт», «бот», «товар»), которые иначе
//   ловили бы любую переписку про акты, ботов и товары;
// - «^счёт» -- слово начинается с этого (прямо перед ним нет буквы/цифры),
//   окончание любое: ловит «счёт», «счета», но не «расчёт». То же правило,
//   что у коротких триггеров, только для длинных слов.
//
// Границы слова -- явные, через Unicode-классы и флаг u: \b в JS без флага u
// после кириллицы не работает вообще (известная ловушка, см. invoiceDrafts.ts).

export const SHORT_TRIGGER_MAX = 3

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// Срезает с краёв всё, что не буква и не цифра (пробелы, знаки, эмодзи).
function stripEdges(text: string): string {
  return text.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '')
}

// Слово встречается с начала слова: прямо перед ним нет буквы или цифры.
function atWordStart(lowerText: string, word: string): boolean {
  return new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(word.toLowerCase())}`, 'u').test(lowerText)
}

// lowerText -- уже приведённый к нижнему регистру текст сообщения клиента.
export function triggerMatches(lowerText: string, trigger: string): boolean {
  if (typeof trigger !== 'string') return false
  const trimmed = trigger.trim()
  if (trimmed === '') return false
  if (trimmed.startsWith('=')) {
    const word = trimmed.slice(1).trim().toLowerCase()
    if (word === '') return false
    return stripEdges(lowerText) === word
  }
  if (trimmed.startsWith('^')) {
    const word = trimmed.slice(1).trim()
    if (word === '') return false
    return atWordStart(lowerText, word)
  }
  if ([...trimmed].length > SHORT_TRIGGER_MAX) {
    return lowerText.includes(trigger.toLowerCase())
  }
  return atWordStart(lowerText, trimmed)
}
