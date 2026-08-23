import { describe, it, expect } from 'vitest'
import { parseTelegramUpdate, telegramDedupKey, pairConversationHistory } from './telegram'

describe('telegramDedupKey', () => {
  it('scopes the update_id by bot id so two bots seeing the same update_id never collide', () => {
    expect(telegramDedupKey('12345', 100000001)).toBe('tg:12345:100000001')
    expect(telegramDedupKey('67890', 100000001)).toBe('tg:67890:100000001')
    expect(telegramDedupKey('12345', 100000001)).not.toBe(telegramDedupKey('67890', 100000001))
  })
})

describe('parseTelegramUpdate', () => {
  const textUpdate = (overrides: Record<string, unknown> = {}, msgOverrides: Record<string, unknown> = {}) => ({
    update_id: 42,
    message: {
      message_id: 7,
      text: 'Сколько стоит доставка?',
      from: { id: 111, is_bot: false, first_name: 'Айгерим', username: 'aigerim_a' },
      chat: { id: 111, type: 'private' },
      ...msgOverrides,
    },
    ...overrides,
  })

  it('parses a plain text message with chat id, text, handle, and update_id', () => {
    const parsed = parseTelegramUpdate(textUpdate())
    expect(parsed).toEqual({
      kind: 'text',
      chatId: '111',
      text: 'Сколько стоит доставка?',
      fromHandle: 'aigerim_a',
      updateId: 42,
    })
  })

  it('falls back to first_name then unknown when username is missing', () => {
    const noUsername = parseTelegramUpdate(textUpdate({}, { from: { id: 111, is_bot: false, first_name: 'Айгерим' } }))
    expect(noUsername.kind === 'text' && noUsername.fromHandle).toBe('Айгерим')
    const noFrom = parseTelegramUpdate(textUpdate({}, { from: undefined }))
    expect(noFrom.kind === 'text' && noFrom.fromHandle).toBe('unknown')
  })

  it('treats /start (bare, with deep-link payload, or @-suffixed) as start, carrying fromHandle', () => {
    expect(parseTelegramUpdate(textUpdate({}, { text: '/start' }))).toEqual({ kind: 'start', chatId: '111', fromHandle: 'aigerim_a' })
    expect(parseTelegramUpdate(textUpdate({}, { text: '/start ref123' }))).toEqual({ kind: 'start', chatId: '111', fromHandle: 'aigerim_a' })
    expect(parseTelegramUpdate(textUpdate({}, { text: '/start@MyBot' }))).toEqual({ kind: 'start', chatId: '111', fromHandle: 'aigerim_a' })
  })

  it('ignores other slash-commands', () => {
    expect(parseTelegramUpdate(textUpdate({}, { text: '/help' }))).toEqual({ kind: 'ignore' })
    expect(parseTelegramUpdate(textUpdate({}, { text: '/settings now' }))).toEqual({ kind: 'ignore' })
  })

  it('treats a message with only whitespace text as unsupported (not ignore) -- it still has a real chat/from', () => {
    expect(parseTelegramUpdate(textUpdate({}, { text: '   ' }))).toEqual({ kind: 'unsupported', chatId: '111' })
  })

  it('parses a photo message, picking the largest (last) size and an optional caption', () => {
    const parsed = parseTelegramUpdate(textUpdate({}, {
      text: undefined,
      caption: 'Вот такой стол',
      photo: [{ file_id: 'small123' }, { file_id: 'large456' }],
    }))
    expect(parsed).toEqual({
      kind: 'photo',
      chatId: '111',
      fromHandle: 'aigerim_a',
      updateId: 42,
      fileId: 'large456',
      caption: 'Вот такой стол',
    })
  })

  it('parses a photo message with no caption as an empty string', () => {
    const parsed = parseTelegramUpdate(textUpdate({}, { text: undefined, photo: [{ file_id: 'only1' }] }))
    expect(parsed.kind === 'photo' && parsed.caption).toBe('')
  })

  it('parses a voice message', () => {
    const parsed = parseTelegramUpdate(textUpdate({}, { text: undefined, voice: { file_id: 'voice789' } }))
    expect(parsed).toEqual({
      kind: 'voice',
      chatId: '111',
      fromHandle: 'aigerim_a',
      updateId: 42,
      fileId: 'voice789',
    })
  })

  it('treats video/document/sticker/location and any other non-text, non-photo, non-voice message as unsupported', () => {
    expect(parseTelegramUpdate(textUpdate({}, { text: undefined, video: { file_id: 'v1' } }))).toEqual({ kind: 'unsupported', chatId: '111' })
    expect(parseTelegramUpdate(textUpdate({}, { text: undefined, sticker: { file_id: 's1' } }))).toEqual({ kind: 'unsupported', chatId: '111' })
    expect(parseTelegramUpdate(textUpdate({}, { text: undefined }))).toEqual({ kind: 'unsupported', chatId: '111' })
  })

  it('falls back to unsupported for a photo/voice missing a usable file_id or update_id', () => {
    expect(parseTelegramUpdate(textUpdate({}, { text: undefined, photo: [{}] }))).toEqual({ kind: 'unsupported', chatId: '111' })
    expect(parseTelegramUpdate(textUpdate({ update_id: 'not-a-number' }, { text: undefined, voice: { file_id: 'v1' } }))).toEqual({ kind: 'unsupported', chatId: '111' })
  })

  it('ignores edited messages and every other non-message update type', () => {
    expect(parseTelegramUpdate({ update_id: 42, edited_message: { text: 'изменено', chat: { id: 111 }, from: { is_bot: false } } })).toEqual({ kind: 'ignore' })
    expect(parseTelegramUpdate({ update_id: 42, callback_query: {} })).toEqual({ kind: 'ignore' })
    expect(parseTelegramUpdate({ update_id: 42 })).toEqual({ kind: 'ignore' })
  })

  it('ignores messages sent by bots', () => {
    expect(parseTelegramUpdate(textUpdate({}, { from: { id: 999, is_bot: true, first_name: 'OtherBot' } }))).toEqual({ kind: 'ignore' })
  })

  it('ignores malformed payloads without crashing', () => {
    expect(parseTelegramUpdate(null)).toEqual({ kind: 'ignore' })
    expect(parseTelegramUpdate({})).toEqual({ kind: 'ignore' })
    expect(parseTelegramUpdate('garbage')).toEqual({ kind: 'ignore' })
    expect(parseTelegramUpdate(textUpdate({ update_id: 'not-a-number' }))).toEqual({ kind: 'ignore' })
    expect(parseTelegramUpdate(textUpdate({}, { chat: {} }))).toEqual({ kind: 'ignore' })
  })
})

describe('parseTelegramUpdate: callback_query', () => {
  it('parses a valid callback_query', () => {
    const parsed = parseTelegramUpdate({
      update_id: 50,
      callback_query: { id: 'cbq123', data: 'btn:1', from: { id: 111, is_bot: false, username: 'aigerim_a' } },
    })
    expect(parsed).toEqual({ kind: 'callback_query', chatId: '111', fromHandle: 'aigerim_a', data: 'btn:1', callbackQueryId: 'cbq123' })
  })

  it('falls back to first_name then unknown when username is missing', () => {
    const withFirstName = parseTelegramUpdate({
      update_id: 50,
      callback_query: { id: 'cbq1', data: 'btn:0', from: { id: 111, first_name: 'Айгерим' } },
    })
    expect(withFirstName.kind === 'callback_query' && withFirstName.fromHandle).toBe('Айгерим')
    const noName = parseTelegramUpdate({
      update_id: 50,
      callback_query: { id: 'cbq1', data: 'btn:0', from: { id: 111 } },
    })
    expect(noName.kind === 'callback_query' && noName.fromHandle).toBe('unknown')
  })

  it('ignores a malformed callback_query missing id, data, or from.id', () => {
    expect(parseTelegramUpdate({ update_id: 50, callback_query: {} })).toEqual({ kind: 'ignore' })
    expect(parseTelegramUpdate({ update_id: 50, callback_query: { id: 'cbq1', from: { id: 111 } } })).toEqual({ kind: 'ignore' })
    expect(parseTelegramUpdate({ update_id: 50, callback_query: { id: 'cbq1', data: 'btn:0' } })).toEqual({ kind: 'ignore' })
  })

  it('callback_query takes priority over any message field on the same update', () => {
    const parsed = parseTelegramUpdate({
      update_id: 50,
      callback_query: { id: 'cbq1', data: 'btn:0', from: { id: 111 } },
      message: { text: 'irrelevant', chat: { id: 999 }, from: { is_bot: false } },
    })
    expect(parsed.kind).toBe('callback_query')
  })
})

describe('pairConversationHistory', () => {
  it('pairs each inbound with the next sent outbound, same rule as the Instagram tenant path', () => {
    const rows = [
      { direction: 'inbound', text: 'Привет', status: 'sent' },
      { direction: 'outbound', text: 'Здравствуйте!', status: 'sent' },
      { direction: 'inbound', text: 'Сколько стоит?', status: 'sent' },
      { direction: 'outbound', text: '5000 тенге', status: 'sent' },
    ]
    expect(pairConversationHistory(rows, 5)).toEqual([
      { incoming: 'Привет', reply: 'Здравствуйте!' },
      { incoming: 'Сколько стоит?', reply: '5000 тенге' },
    ])
  })

  it('skips pending_review and skipped drafts -- the customer never saw them', () => {
    const rows = [
      { direction: 'inbound', text: 'Вопрос 1', status: 'sent' },
      { direction: 'outbound', text: 'черновик', status: 'pending_review' },
      { direction: 'inbound', text: 'Вопрос 2', status: 'sent' },
      { direction: 'outbound', text: 'пропущено', status: 'skipped' },
      { direction: 'outbound', text: 'Реальный ответ', status: 'sent' },
    ]
    // Вопрос 1's pendingIncoming is overwritten by Вопрос 2, which then
    // pairs with the first *sent* outbound after it.
    expect(pairConversationHistory(rows, 5)).toEqual([
      { incoming: 'Вопрос 2', reply: 'Реальный ответ' },
    ])
  })

  it('keeps only the last maxPairs pairs', () => {
    const rows = Array.from({ length: 8 }, (_, i) => [
      { direction: 'inbound', text: `in${i}`, status: 'sent' },
      { direction: 'outbound', text: `out${i}`, status: 'sent' },
    ]).flat()
    const pairs = pairConversationHistory(rows, 3)
    expect(pairs).toHaveLength(3)
    expect(pairs[0]).toEqual({ incoming: 'in5', reply: 'out5' })
    expect(pairs[2]).toEqual({ incoming: 'in7', reply: 'out7' })
  })

  it('returns empty for an empty or unpaired history', () => {
    expect(pairConversationHistory([], 5)).toEqual([])
    expect(pairConversationHistory([{ direction: 'inbound', text: 'только вопрос', status: 'sent' }], 5)).toEqual([])
  })
})
