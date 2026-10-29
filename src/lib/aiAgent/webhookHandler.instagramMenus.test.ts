import { describe, it, expect, vi, beforeEach } from 'vitest'

// Интеграционный тест handleTenantIncoming (Instagram) на поддельной базе:
// кодовые слова в комментариях (Private Reply), меню на вложение, нажатие
// «готового вопроса» и, главное, НЕИЗМЕННОСТЬ поведения агента без особых строк.

const h = vi.hoisted(() => {
  const state = {
    templates: [] as any[],
    messages: [] as any[],
    sends: [] as { kind: string; to: string; text: string }[],
    failPrivate: false,
    failButton: null as null | { status: number },
    failDm: false,
    reminders: [] as any[],
    ownerIsAdmin: true,
    convs: {} as Record<string, string>,
    aiCalls: 0,
    queries: [] as { table: string; op: string }[],
  }
  return { state }
})

vi.mock('@supabase/supabase-js', () => {
  const state = h.state
  const parseOr = (s: string): string[] => (s.match(/channel\.eq\.(\w+)/g) || []).map(x => x.replace('channel.eq.', ''))
  return {
    createClient: () => ({
      from(table: string) {
        const q: any = { table, op: 'select', payload: null, filters: [] as any[], or: null as string | null, order: false, cols: undefined as string | undefined }
        const resolve = (mode: string) => {
          state.queries.push({ table, op: q.op })
          const f = (c: string) => q.filters.find((x: any) => x[1] === c)
          if (table === 'ig_dm_reminders') {
            const conv = q.filters.find((x: any) => x[1] === 'conversation_id')?.[2]
            const status = q.filters.find((x: any) => x[1] === 'status')?.[2]
            if (q.op === 'upsert') {
              if (!state.reminders.some(r => r.conversation_id === q.payload.conversation_id)) state.reminders.push({ ...q.payload })
              return { data: null, error: null }
            }
            if (q.op === 'update') {
              for (const r of state.reminders) if (r.conversation_id === conv && r.status === status) Object.assign(r, q.payload)
              return { data: null, error: null }
            }
            return { data: state.reminders.find(r => r.conversation_id === conv) ?? null, error: null }
          }
          if (table === 'ai_agent_messages') {
            if (q.op === 'select' && q.cols === 'created_at') {
              const inbound = state.messages.filter(m => m.direction === 'inbound')
              const last = inbound[inbound.length - 1]
              return { data: last ? { created_at: last.created_at } : null, error: null }
            }
            if (q.op === 'insert') {
              const ext = q.payload.external_id
              if (ext && state.messages.some(m => m.external_id === ext)) return { data: null, error: { code: '23505', message: 'dup' } }
              state.messages.push({ ...q.payload, created_at: new Date().toISOString() })
              return { data: { id: 'm' + state.messages.length }, error: null }
            }
            // защита публичного меню @comment_default: недавние исходящие с этим текстом
            const dirF = f('direction')
            if (dirF && dirF[2] === 'outbound') {
              const txt = q.filters.find((x: any) => x[1] === 'text')
              const rows = state.messages.filter(m => m.direction === 'outbound' && m.text === txt?.[2])
              return {
                data: rows.map(r => ({ created_at: r.created_at, ai_agent_conversations: { agent_id: 'agent1', customer_handle: state.convs[r.conversation_id] ?? null } })),
                error: null,
              }
            }
            const ext = f('external_id')
            if (ext && ext[0] === 'eq') {
              const hit = state.messages.find(m => m.external_id === ext[2])
              return { data: hit ? { id: 'x' } : null, error: null }
            }
            // защита от двойного ответа на нажатие «готового вопроса»
            const like = q.filters.find((x: any) => x[0] === 'like')
            const notLike = q.filters.find((x: any) => x[0] === 'not')
            const inT = q.filters.find((x: any) => x[0] === 'in')
            const eqT = q.filters.find((x: any) => x[0] === 'eq' && x[1] === 'text')
            const rows = state.messages.filter(m => {
              if (m.direction !== 'inbound') return false
              if (like && !String(m.external_id).startsWith('pb:')) return false
              if (notLike && String(m.external_id).startsWith('pb:')) return false
              if (inT && !inT[2].includes(m.text)) return false
              if (eqT && m.text !== eqT[2]) return false
              return true
            })
            return { data: rows.map(r => ({ id: r.external_id })), error: null }
          }
          if (table === 'ai_agents') return { data: { id: 'agent1', user_id: 'u1', status: 'active', is_enabled: true, stop_phrases: ['оператор'] }, error: null }
          if (table === 'ai_agent_conversations') {
            if (q.op === 'upsert') {
              const id = 'conv-' + q.payload.external_thread_id
              state.convs[id] = q.payload.customer_handle
              return { data: { id, paused_for_human: false }, error: null }
            }
            return { data: [], error: null }
          }
          if (table === 'profiles') return { data: { is_admin: state.ownerIsAdmin }, error: null }
          if (table === 'ai_agent_reply_templates') {
            const chans = q.or ? parseOr(q.or) : null
            const rows = state.templates.filter(t => !chans || t.channel == null || chans.includes(t.channel))
            return { data: rows, error: null }
          }
          return { data: mode === 'await' ? [] : null, error: null }
        }
        const b: any = {
          select(c?: string) { q.cols = c; return b },
          insert(p: any) { q.op = 'insert'; q.payload = p; return b },
          upsert(p: any) { q.op = 'upsert'; q.payload = p; return b },
          update(p: any) { q.op = 'update'; q.payload = p; return b },
          eq(c: string, v: any) { q.filters.push(['eq', c, v]); return b },
          in(c: string, v: any) { q.filters.push(['in', c, v]); return b },
          not(c: string, _o: string, _v: any) { q.filters.push(['not', c, _v]); return b },
          like(c: string, v: any) { q.filters.push(['like', c, v]); return b },
          gte() { return b },
          limit() { return b },
          or(s: string) { q.or = s; return b },
          order() { return b },
          single: () => Promise.resolve(resolve('single')),
          maybeSingle: () => Promise.resolve(resolve('maybeSingle')),
          then: (res: any, rej: any) => Promise.resolve(resolve('await')).then(res, rej),
        }
        return b
      },
    }),
  }
})

vi.mock('@/lib/kaspiPay/crypto', () => ({ decryptAtRest: () => Buffer.from('tok') }))
vi.mock('./connection', () => ({ getKey: () => 'k' }))
vi.mock('./planGate', () => ({
  agentReplyState: async () => 'reply',
  storesInboundOnly: () => false,
  agentCanReply: async () => true,
}))
vi.mock('./trainingExit', () => ({ exitTrainingIfDue: async () => false }))
vi.mock('./rateLimit', () => ({ isConversationRateLimited: async () => false }))
vi.mock('./wallet', () => ({
  hasAiAgentBudget: async () => true,
  debitAiAgentWallet: async () => 0,
  AI_AGENT_CREDITS_PER_AI_REPLY: 1,
  AI_AGENT_BUDGET_DEPLETED_REPLY: 'depleted',
}))
vi.mock('./budgetAlert', () => ({ scheduleBudgetDepletedAlert: () => {} }))
vi.mock('./replyContext', () => ({
  buildAgentReplyContext: async () => ({ catalog: [], businessContextLine: '', salonInfo: null }),
}))
vi.mock('@/lib/notifications', () => ({ createNotification: async () => {} }))
vi.mock('@/lib/notificationPrefsServer', () => ({ notifyOwnerTelegram: async () => {} }))
vi.mock('@/lib/instagramAiReply', () => ({
  generateAiReply: async () => { h.state.aiCalls++; return { replyText: 'AI-ответ', urgent: false, extractedFields: undefined } },
}))
vi.mock('@/lib/instagram', async () => {
  class InstagramApiError extends Error {
    constructor(message: string, public status: number) { super(message); this.name = 'InstagramApiError' }
  }
  return {
    InstagramApiError,
    replyToComment: async (id: string, text: string) => { h.state.sends.push({ kind: 'comment', to: id, text }) },
    sendDirectMessage: async (id: string, text: string) => {
      if (h.state.failDm) throw new InstagramApiError('(#10) outside window', 400)
      h.state.sends.push({ kind: 'dm', to: id, text })
    },
    sendDirectImage: async () => {},
    sendInstagramFlowStep: async () => {},
    sendInstagramButtonTemplate: async (id: string, b: any) => {
      if (h.state.failButton) throw new InstagramApiError('Invalid parameter (code 100)', h.state.failButton.status)
      h.state.sends.push({ kind: 'button', to: id, text: JSON.stringify(b) })
    },
    sendPrivateReply: async (id: string, text: string) => {
      if (h.state.failPrivate) throw new InstagramApiError('(#10) Private reply already sent', 400)
      h.state.sends.push({ kind: 'private', to: id, text })
    },
  }
})

import { handleTenantIncoming } from './webhookHandler'

const conn = { connectionId: 'c1', agentId: 'agent1', externalAccountId: 'ig1', accessToken: 'tok' }
const t = (id: string, channel: string | null, trigger_words: string[], reply_text: string) => ({ id, channel, trigger_words, reply_text })

const LEGACY_TEMPLATES = [
  t('schet', 'dm', ['^счёт'], 'Ссылка на счёт'),
  t('kontr', 'dm', ['контрагент', 'бин'], 'Ссылка на проверку БИН'),
  t('price', null, ['цена'], 'Тарифы'),
]
// Кодовые слова помечены @codeword (явное включение); «огонь» (DM-шаблон-реакция)
// без маркера в комментариях не участвует.
const SPECIAL_LEGACY = [
  t('schet', 'dm', ['^счёт', '@codeword'], 'Ссылка на счёт'),
  t('kontr', 'dm', ['контрагент', 'бин', '@codeword'], 'Ссылка на проверку БИН'),
  t('fire', 'dm', ['огонь', 'срочно'], 'Спасибо за энергию!'),
  t('price', null, ['цена'], 'Тарифы'),
]
const SPECIAL = [
  t('ack', 'comment', ['@comment_ack'], 'Ссылка отправлена вам в личные сообщения'),
  t('def', 'comment', ['@comment_default'], 'Напишите слово в директ: СЧЁТ, АКТ'),
  t('att', 'dm', ['@attachment', '@attachment_image'], 'Напишите слово: КОНТРАГЕНТ, СЧЁТ'),
  t('hi', 'dm', ['=здравствуйте'], 'Меню слов'),
]

const comment = (id: string, text: string, extra: any = {}) => ({ source: 'comment' as const, externalId: id, fromUsername: 'ivan', incomingText: text, replyTarget: id, ...extra })
const dm = (id: string, text: string, extra: any = {}) => ({ source: 'dm' as const, externalId: id, fromUsername: 'u1', incomingText: text, replyTarget: 'u1', ...extra })

beforeEach(() => {
  h.state.templates = []
  h.state.messages = []
  h.state.sends = []
  h.state.failPrivate = false
  h.state.failButton = null
  h.state.failDm = false
  h.state.reminders = []
  h.state.ownerIsAdmin = true
  h.state.convs = {}
  h.state.aiCalls = 0
  h.state.queries = []
})

describe('агент БЕЗ особых строк: поведение прежнее', () => {
  beforeEach(() => { h.state.templates = [...LEGACY_TEMPLATES] })

  it('комментарий «Контрагент» -- DM-шаблон на комментарий не применяется, отвечает ИИ (как раньше)', async () => {
    await handleTenantIncoming(conn, comment('cm1', 'Контрагент'))
    expect(h.state.sends).toEqual([{ kind: 'comment', to: 'cm1', text: 'AI-ответ' }])
    expect(h.state.aiCalls).toBe(1)
  })
  it('комментарий «Цена?» -- шаблон на все каналы, публичный ответ', async () => {
    await handleTenantIncoming(conn, comment('cm2', 'Цена?'))
    expect(h.state.sends).toEqual([{ kind: 'comment', to: 'cm2', text: 'Тарифы' }])
    expect(h.state.aiCalls).toBe(0)
  })
  it('DM со словом -- шаблонный ответ; «Здравствуйте» -- ИИ', async () => {
    await handleTenantIncoming(conn, dm('d1', 'Здравствуйте, как проверить БИН компании?'))
    expect(h.state.sends).toEqual([{ kind: 'dm', to: 'u1', text: 'Ссылка на проверку БИН' }])
    await handleTenantIncoming(conn, dm('d2', 'Здравствуйте'))
    expect(h.state.sends[1]).toEqual({ kind: 'dm', to: 'u1', text: 'AI-ответ' })
  })
  it('isReply без особых строк ничего не меняет: ИИ отвечает на ответ в ветке, как раньше', async () => {
    await handleTenantIncoming(conn, comment('cm4', 'Спасибо', { isReply: true }))
    expect(h.state.sends).toEqual([{ kind: 'comment', to: 'cm4', text: 'AI-ответ' }])
  })
  it('клиент пишет название маркера -- обычный ИИ-ответ, а не настройка', async () => {
    await handleTenantIncoming(conn, comment('cm3', '@comment_ack'))
    expect(h.state.sends.map(s => s.kind)).toEqual(['comment'])
    expect(h.state.sends[0].text).toBe('AI-ответ')
  })
})

describe('агент с особыми строками', () => {
  beforeEach(() => { h.state.templates = [...SPECIAL, ...SPECIAL_LEGACY] })

  it('«Контрагент» в комментарии: Private Reply со ссылкой + публичный «ссылка отправлена», ИИ не зовётся', async () => {
    await handleTenantIncoming(conn, comment('cm1', 'Контрагент'))
    expect(h.state.sends).toEqual([
      { kind: 'private', to: 'cm1', text: 'Ссылка на проверку БИН' },
      { kind: 'comment', to: 'cm1', text: 'Ссылка отправлена вам в личные сообщения' },
    ])
    expect(h.state.aiCalls).toBe(0)
    const out = h.state.messages.filter(m => m.direction === 'outbound').map(m => m.text)
    expect(out).toEqual(['[в личные сообщения] Ссылка на проверку БИН', 'Ссылка отправлена вам в личные сообщения'])
  })

  it('дубль доставки того же комментария: второго Private Reply нет', async () => {
    await handleTenantIncoming(conn, comment('cm1', 'Контрагент'))
    await handleTenantIncoming(conn, comment('cm1', 'Контрагент'))
    expect(h.state.sends.filter(s => s.kind === 'private')).toHaveLength(1)
    expect(h.state.sends.filter(s => s.kind === 'comment')).toHaveLength(1)
  })

  it('два РАЗНЫХ комментария -- каждый получает свой Private Reply', async () => {
    await handleTenantIncoming(conn, comment('cm1', 'Контрагент'))
    await handleTenantIncoming(conn, comment('cm2', 'счёт'))
    expect(h.state.sends.filter(s => s.kind === 'private').map(s => s.text)).toEqual(['Ссылка на проверку БИН', 'Ссылка на счёт'])
  })

  it('ошибка Private Reply: публично -- меню, не «ссылка отправлена»; обработчик не падает', async () => {
    h.state.failPrivate = true
    await expect(handleTenantIncoming(conn, comment('cm1', 'Контрагент'))).resolves.toBeUndefined()
    expect(h.state.sends).toEqual([{ kind: 'comment', to: 'cm1', text: 'Напишите слово в директ: СЧЁТ, АКТ' }])
    expect(h.state.aiCalls).toBe(0)
  })

  it('прочие комментарии с буквами от разных людей -- меню вместо ИИ', async () => {
    for (const [i, txt] of ['Здравствуйте', 'Темеш🥰'].entries()) {
      await handleTenantIncoming(conn, comment('cc' + i, txt, { fromUsername: 'user' + i }))
    }
    expect(h.state.sends.map(s => s.text)).toEqual(Array(2).fill('Напишите слово в директ: СЧЁТ, АКТ'))
    expect(h.state.aiCalls).toBe(0)
  })

  it('@comment_default: эмодзи и знаки без букв -- молчим (ИИ не зовётся, меню не шлётся)', async () => {
    for (const [i, txt] of ['🔥', '👍👍', '!!!'].entries()) {
      await handleTenantIncoming(conn, comment('e' + i, txt, { fromUsername: 'u' + i }))
    }
    expect(h.state.sends).toEqual([])
    expect(h.state.aiCalls).toBe(0)
  })

  it('@comment_default: ответ в ветке под чужим комментарием (parent_id) -- молчим', async () => {
    await handleTenantIncoming(conn, comment('r1', 'Спасибо, согласен', { isReply: true }))
    expect(h.state.sends).toEqual([])
    expect(h.state.aiCalls).toBe(0)
  })

  it('@comment_default: тому же автору второй раз меню не шлётся', async () => {
    await handleTenantIncoming(conn, comment('a1', 'Здравствуйте'))
    await handleTenantIncoming(conn, comment('a2', 'А ещё вопрос'))
    expect(h.state.sends.map(s => s.text)).toEqual(['Напишите слово в директ: СЧЁТ, АКТ'])
  })

  it('@comment_default: не более 5 публичных меню в час на аккаунт', async () => {
    for (let i = 0; i < 8; i++) await handleTenantIncoming(conn, comment('l' + i, 'Привет', { fromUsername: 'p' + i }))
    expect(h.state.sends.filter(s => s.kind === 'comment')).toHaveLength(5)
    expect(h.state.aiCalls).toBe(0)
  })

  it('комментарий «огонь» (DM-шаблон-реакция БЕЗ @codeword): нет ни Private Reply, ни «ссылка отправлена» -- обычное меню', async () => {
    await handleTenantIncoming(conn, comment('f1', 'огонь'))
    expect(h.state.sends).toEqual([{ kind: 'comment', to: 'f1', text: 'Напишите слово в директ: СЧЁТ, АКТ' }])
  })

  it('владелец без права manage_comments (не админ): режим @comment_ack не включается, Private Reply не зовётся', async () => {
    h.state.ownerIsAdmin = false
    await handleTenantIncoming(conn, comment('n1', 'Контрагент'))
    expect(h.state.sends.filter(s => s.kind === 'private')).toEqual([])
    expect(h.state.sends).toEqual([{ kind: 'comment', to: 'n1', text: 'Напишите слово в директ: СЧЁТ, АКТ' }])
  })

  it('кодовое слово в ответе в ветке с упавшим Private Reply: запасное меню не публикуется', async () => {
    h.state.failPrivate = true
    await handleTenantIncoming(conn, comment('t1', 'Контрагент', { isReply: true }))
    expect(h.state.sends).toEqual([])
  })

  it('комментарий «Цена?» по-прежнему получает тарифы (шаблон на все каналы)', async () => {
    await handleTenantIncoming(conn, comment('cm5', 'Цена?'))
    expect(h.state.sends).toEqual([{ kind: 'comment', to: 'cm5', text: 'Тарифы' }])
  })

  it('«Здравствуйте» в директе -- меню слов (не ИИ)', async () => {
    await handleTenantIncoming(conn, dm('d1', 'Здравствуйте!'))
    expect(h.state.sends).toEqual([{ kind: 'dm', to: 'u1', text: 'Меню слов' }])
    expect(h.state.aiCalls).toBe(0)
  })

  it('«Здравствуйте, как проверить БИН компании?» по-прежнему шаблон со ссылкой', async () => {
    await handleTenantIncoming(conn, dm('d2', 'Здравствуйте, как проверить БИН компании?'))
    expect(h.state.sends).toEqual([{ kind: 'dm', to: 'u1', text: 'Ссылка на проверку БИН' }])
  })

  it('вложение без текста: меню слов вместо «не умею»', async () => {
    await handleTenantIncoming(conn, dm('d3', '[Вложение]', { attachmentOnly: true }))
    expect(h.state.sends).toEqual([{ kind: 'dm', to: 'u1', text: 'Напишите слово: КОНТРАГЕНТ, СЧЁТ' }])
    expect(h.state.aiCalls).toBe(0)
  })

  it('нажатие «готового вопроса»: payload идёт как текст, в журнале подпись кнопки', async () => {
    await handleTenantIncoming(conn, dm('pb:m1', 'КОНТРАГЕНТ', { loggedText: 'Проверить контрагента по БИН', fromPostback: true }))
    expect(h.state.sends).toEqual([{ kind: 'dm', to: 'u1', text: 'Ссылка на проверку БИН' }])
    expect(h.state.messages.find(m => m.direction === 'inbound')?.text).toBe('Проверить контрагента по БИН')
  })

  it('повторная доставка того же нажатия -- без второго ответа', async () => {
    const p = dm('pb:m1', 'КОНТРАГЕНТ', { loggedText: 'Проверить контрагента по БИН', fromPostback: true })
    await handleTenantIncoming(conn, p)
    await handleTenantIncoming(conn, p)
    expect(h.state.sends).toHaveLength(1)
  })

  it('Meta прислала и postback, и обычное сообщение с подписью кнопки -- ответ один (любой порядок)', async () => {
    const pb = dm('pb:m1', 'КОНТРАГЕНТ', { loggedText: 'Проверить контрагента по БИН', fromPostback: true })
    const msg = dm('mid-1', 'Проверить контрагента по БИН')
    await handleTenantIncoming(conn, pb)
    await handleTenantIncoming(conn, msg)
    expect(h.state.sends).toHaveLength(1)

    h.state.messages = []
    h.state.sends = []
    await handleTenantIncoming(conn, dm('mid-2', 'Проверить контрагента по БИН'))
    await handleTenantIncoming(conn, dm('pb:m2', 'КОНТРАГЕНТ', { loggedText: 'Проверить контрагента по БИН', fromPostback: true }))
    expect(h.state.sends).toHaveLength(1)
  })

  it('обычный текст без нажатий -- защита ничего не гасит (два одинаковых сообщения подряд -- два ответа)', async () => {
    await handleTenantIncoming(conn, dm('d1', 'контрагент'))
    await handleTenantIncoming(conn, dm('d2', 'контрагент'))
    expect(h.state.sends).toHaveLength(2)
  })
})

// Ответ-карточка с кнопкой (строка шаблона с блоком @@button, instagramButtonTemplate.ts).
const OLD_TEXT = 'Вот проверка по БИН 👇 https://invoices.kz/go/dm-kontragent\n\nПокажет неблагонадёжность, ликвидацию, налоговый долг и НДС по данным КГД. 3 проверки в квартал бесплатно.'
const BTN_ROW = `${OLD_TEXT}\n\n@@button\ntitle: Вот проверка по БИН 👇\nsubtitle: Неблагонадёжность, ликвидация, налоговый долг, НДС. 3 проверки в квартал\nbutton: Открыть проверку\nurl: https://invoices.kz/go/dm-kontragent-btn`
const BUTTON = {
  title: 'Вот проверка по БИН 👇',
  subtitle: 'Неблагонадёжность, ликвидация, налоговый долг, НДС. 3 проверки в квартал',
  buttonTitle: 'Открыть проверку',
  url: 'https://invoices.kz/go/dm-kontragent-btn',
}
const LOGGED = 'Вот проверка по БИН 👇\nНеблагонадёжность, ликвидация, налоговый долг, НДС. 3 проверки в квартал\nhttps://invoices.kz/go/dm-kontragent-btn'

describe('ответ-карточка с кнопкой на КОНТРАГЕНТ', () => {
  beforeEach(() => {
    h.state.templates = [
      ...SPECIAL,
      t('kontr', 'dm', ['контрагент', 'бин', '@codeword'], BTN_ROW),
    ]
  })
  const outbound = () => h.state.messages.filter(m => m.direction === 'outbound').map(m => m.text)

  it('слово, набранное руками (может быть десктоп): по умолчанию обычный текст, карточка не шлётся', async () => {
    await handleTenantIncoming(conn, dm('d1', 'контрагент'))
    expect(h.state.sends).toEqual([{ kind: 'dm', to: 'u1', text: OLD_TEXT }])
    expect(outbound()).toEqual([OLD_TEXT])
    expect(h.state.aiCalls).toBe(0)
  })

  it('слово, набранное руками, при «typed: yes» в блоке: карточка, текст не дублируется, в журнале читаемый текст', async () => {
    h.state.templates = [...SPECIAL, t('kontr', 'dm', ['контрагент', 'бин', '@codeword'], `${BTN_ROW}\ntyped: yes`)]
    await handleTenantIncoming(conn, dm('d1', 'контрагент'))
    expect(h.state.sends).toEqual([{ kind: 'button', to: 'u1', text: JSON.stringify(BUTTON) }])
    expect(outbound()).toEqual([LOGGED])
  })

  it('нажатие «готового вопроса» (postback): тоже карточка', async () => {
    await handleTenantIncoming(conn, dm('pb:m1', 'КОНТРАГЕНТ', { loggedText: 'Проверить контрагента по БИН', fromPostback: true }))
    expect(h.state.sends.map(s => s.kind)).toEqual(['button'])
    expect(outbound()).toEqual([LOGGED])
  })

  it('Meta пришлёт и postback, и сообщение с подписью кнопки: ответ один (защита от эха цела)', async () => {
    await handleTenantIncoming(conn, dm('pb:m1', 'КОНТРАГЕНТ', { loggedText: 'Проверить контрагента по БИН', fromPostback: true }))
    await handleTenantIncoming(conn, dm('mid-1', 'Проверить контрагента по БИН'))
    expect(h.state.sends).toHaveLength(1)
  })

  it('повторная доставка того же сообщения: карточка не дублируется', async () => {
    const pb = () => dm('pb:m9', 'бин', { fromPostback: true })
    await handleTenantIncoming(conn, pb())
    await handleTenantIncoming(conn, pb())
    expect(h.state.sends).toHaveLength(1)
  })

  it.each([400, 403, 0])('Meta отвергла карточку (HTTP %i): тот же ответ уходит текстом со ссылкой, один раз, в журнале текст', async status => {
    h.state.failButton = { status }
    await handleTenantIncoming(conn, dm('pb:m1', 'КОНТРАГЕНТ', { loggedText: 'Проверить контрагента по БИН', fromPostback: true }))
    expect(h.state.sends).toEqual([{ kind: 'dm', to: 'u1', text: OLD_TEXT }])
    expect(outbound()).toEqual([OLD_TEXT])
  })

  it('комментарий с кодовым словом: Private Reply и публичный ответ -- обычный текст без разметки', async () => {
    await handleTenantIncoming(conn, comment('cm1', 'Контрагент'))
    expect(h.state.sends).toEqual([
      { kind: 'private', to: 'cm1', text: OLD_TEXT },
      { kind: 'comment', to: 'cm1', text: 'Ссылка отправлена вам в личные сообщения' },
    ])
    expect(JSON.stringify(h.state.sends)).not.toContain('@@button')
  })

  it('другие шаблоны остаются обычным текстом', async () => {
    h.state.templates.push(t('hi2', 'dm', ['=привет'], 'Меню слов'))
    await handleTenantIncoming(conn, dm('d2', 'привет'))
    expect(h.state.sends).toEqual([{ kind: 'dm', to: 'u1', text: 'Меню слов' }])
  })
})

describe('служебный блок не утекает клиенту в других местах', () => {
  it('шаблон на все каналы с блоком: в комментарии публикуется чистый текст', async () => {
    h.state.templates = [t('p', null, ['цена'], 'Тарифы тут\n\n@@button\ntitle: Т\nbutton: Открыть\nurl: https://invoices.kz/x')]
    await handleTenantIncoming(conn, comment('c1', 'Цена?'))
    expect(h.state.sends).toEqual([{ kind: 'comment', to: 'c1', text: 'Тарифы тут' }])
  })
})

// Напоминание через 2 часа (dmReminder.ts): токен диалога в ссылках ответа на КОНТРАГЕНТ.
describe('токен напоминания в ответе на КОНТРАГЕНТ', () => {
  const REM = t('rem', 'dm', ['@reminder'], '')
  const SCHET = t('schet', 'dm', ['^счёт', '@codeword'], 'Ссылка на счёт https://invoices.kz/go/dm-schet')
  const TOKEN_LINK = /https:\/\/invoices\.kz\/go\/dm-kontragent\?utm_content=([A-Za-z0-9_-]{16})/

  it('БЕЗ строки @reminder: ответ байт-в-байт прежний, ни токена, ни записей (выключено по умолчанию)', async () => {
    h.state.templates = [...SPECIAL, t('kontr', 'dm', ['контрагент', 'бин', '@codeword'], BTN_ROW)]
    await handleTenantIncoming(conn, dm('d1', 'контрагент'))
    expect(h.state.sends).toEqual([{ kind: 'dm', to: 'u1', text: OLD_TEXT }])
    expect(h.state.reminders).toEqual([])
    expect(JSON.stringify(h.state.sends)).not.toContain('utm_content')
  })

  it('со строкой @reminder: слово текстом -- токен в ссылке, строка pending, в журнале то же, что получил клиент', async () => {
    h.state.templates = [...SPECIAL, REM, t('kontr', 'dm', ['контрагент', 'бин', '@codeword'], BTN_ROW)]
    await handleTenantIncoming(conn, dm('d1', 'контрагент'))
    const sent = h.state.sends[0]
    expect(sent.kind).toBe('dm')
    const m = sent.text.match(TOKEN_LINK)
    expect(m).not.toBeNull()
    expect(h.state.reminders).toHaveLength(1)
    expect(h.state.reminders[0]).toMatchObject({ status: 'pending', token: m![1], agent_id: 'agent1' })
    expect(h.state.messages.filter(x => x.direction === 'outbound').map(x => x.text)).toEqual([sent.text])
    // токен не выводится из данных человека
    expect(m![1]).not.toMatch(/u1|ivan/i)
  })

  it('нажатие «готового вопроса»: карточка, у кнопки тот же токен', async () => {
    h.state.templates = [...SPECIAL, REM, t('kontr', 'dm', ['контрагент', 'бин', '@codeword'], BTN_ROW)]
    await handleTenantIncoming(conn, dm('pb:m1', 'КОНТРАГЕНТ', { loggedText: 'Проверить контрагента по БИН', fromPostback: true }))
    expect(h.state.sends.map(s => s.kind)).toEqual(['button'])
    const btn = JSON.parse(h.state.sends[0].text)
    expect(btn.url).toMatch(/^https:\/\/invoices\.kz\/go\/dm-kontragent-btn\?utm_content=[A-Za-z0-9_-]{16}$/)
    expect(h.state.reminders[0]).toMatchObject({ status: 'pending', token: btn.url.split('=')[1] })
  })

  it('второе КОНТРАГЕНТ в том же диалоге: строка одна, токен прежний (одно напоминание на диалог)', async () => {
    h.state.templates = [...SPECIAL, REM, t('kontr', 'dm', ['контрагент', 'бин', '@codeword'], BTN_ROW)]
    await handleTenantIncoming(conn, dm('d1', 'контрагент'))
    await handleTenantIncoming(conn, dm('d2', 'контрагент'))
    expect(h.state.reminders).toHaveLength(1)
    const tokens = h.state.sends.map(s => s.text.match(TOKEN_LINK)?.[1])
    expect(tokens[0]).toBeTruthy()
    expect(tokens[1]).toBe(tokens[0])
  })

  it('другие кодовые слова (СЧЁТ) токен не получают и напоминаний не создают', async () => {
    h.state.templates = [...SPECIAL, REM, SCHET]
    await handleTenantIncoming(conn, dm('d1', 'счёт'))
    expect(h.state.sends).toEqual([{ kind: 'dm', to: 'u1', text: 'Ссылка на счёт https://invoices.kz/go/dm-schet' }])
    expect(h.state.reminders).toEqual([])
  })

  it('отправка ответа не удалась: строка остаётся prepared, напоминания о неполученной ссылке не будет', async () => {
    h.state.templates = [...SPECIAL, REM, t('kontr', 'dm', ['контрагент', 'бин', '@codeword'], BTN_ROW)]
    h.state.failDm = true
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(handleTenantIncoming(conn, dm('d1', 'контрагент'))).resolves.toBeUndefined()
    log.mockRestore()
    expect(h.state.reminders).toHaveLength(1)
    expect(h.state.reminders[0].status).toBe('prepared')
  })

  it('комментарий с кодовым словом (Private Reply): токена и напоминания нет', async () => {
    h.state.templates = [...SPECIAL, REM, t('kontr', 'dm', ['контрагент', 'бин', '@codeword'], BTN_ROW)]
    await handleTenantIncoming(conn, comment('cm1', 'Контрагент'))
    expect(JSON.stringify(h.state.sends)).not.toContain('utm_content')
    expect(h.state.reminders).toEqual([])
  })

  it('строка @reminder не срабатывает на текст клиента', async () => {
    h.state.templates = [...SPECIAL, REM]
    await handleTenantIncoming(conn, dm('d1', '@reminder'))
    expect(h.state.sends[0].text).toBe('AI-ответ')
  })
})
