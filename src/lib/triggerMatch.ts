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
//
// Границы слова -- явные, через Unicode-классы и флаг u: \b в JS без флага u
// после кириллицы не работает вообще (известная ловушка, см. invoiceDrafts.ts).

export const SHORT_TRIGGER_MAX = 3

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// lowerText -- уже приведённый к нижнему регистру текст сообщения клиента.
export function triggerMatches(lowerText: string, trigger: string): boolean {
  if (typeof trigger !== 'string') return false
  const trimmed = trigger.trim()
  if (trimmed === '') return false
  if ([...trimmed].length > SHORT_TRIGGER_MAX) {
    return lowerText.includes(trigger.toLowerCase())
  }
  const re = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(trimmed.toLowerCase())}`, 'u')
  return re.test(lowerText)
}
