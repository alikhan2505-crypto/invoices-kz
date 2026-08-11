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
}): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured')

  const client = new Anthropic({ apiKey })

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

  const message = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 300,
    messages: [{
      role: 'user',
      content: `Ты отвечаешь от имени бизнес-аккаунта в Instagram (invoices.kz — сервис для выставления счетов в Казахстане). ${contextLine}${historyBlock}

Пользователь ${params.fromUsername} написал: "${params.incomingText}"

${lengthInstruction} Пиши вежливо и дружелюбно на русском языке. Не придумывай факты о ценах, сроках или функциях, которых ты не знаешь — в таком случае вежливо предложи написать в директ для уточнения деталей. Верни только текст ответа, без кавычек и пояснений.`,
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
