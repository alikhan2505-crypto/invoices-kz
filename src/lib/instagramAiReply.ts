import Anthropic from '@anthropic-ai/sdk'

// No test file: this is a live network call to a paid API, matching this
// codebase's existing convention (e.g. sendTelegramNotification in
// telegramNotify.ts is likewise untested — only pure logic like
// parseStartToken gets a colocated test).
export async function generateAiReply(params: {
  incomingText: string
  fromUsername: string
  postCaption?: string
}): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured')

  const client = new Anthropic({ apiKey })

  const contextLine = params.postCaption
    ? `Комментарий оставлен под постом с подписью: "${params.postCaption}"`
    : 'Это личное сообщение (DM), не привязано к конкретному посту.'

  const message = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 300,
    messages: [{
      role: 'user',
      content: `Ты отвечаешь от имени бизнес-аккаунта в Instagram (invoices.kz — сервис для выставления счетов в Казахстане). ${contextLine}

Пользователь ${params.fromUsername} написал: "${params.incomingText}"

Напиши короткий, вежливый, дружелюбный ответ на русском языке (2-3 предложения максимум). Не придумывай факты о ценах, сроках или функциях, которых ты не знаешь — в таком случае вежливо предложи написать в директ для уточнения деталей. Верни только текст ответа, без кавычек и пояснений.`,
    }],
  })

  const textBlock = message.content.find(block => block.type === 'text')
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('AI reply generation returned no text')
  }
  return textBlock.text.trim()
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

Выдели 1-3 коротких ключевых слова или фразы (на русском, каждая по 1-3 слова), по которым это сообщение можно узнать среди похожих будущих сообщений. Не используй голые приветствия/вводные слова отдельным пунктом (например одно "здравствуйте" или "привет") -- только то, что различает именно эту тему обращения. Верни только список через запятую, без нумерации и пояснений.`,
    }],
  })

  const textBlock = message.content.find(block => block.type === 'text')
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('Trigger word extraction returned no text')
  }
  return textBlock.text.trim().split(',').map(w => w.trim().toLowerCase()).filter(Boolean).slice(0, 3)
}
