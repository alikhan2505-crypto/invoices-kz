import { describe, it, expect, vi } from 'vitest'
import {
  planCommentReply, runCommentCodeword, findCommentDefaultText, attachmentRuleFromRows, attachmentMenuApplies, commentDefaultAllowed,
  type TemplateRow,
} from './instagramSpecialTemplates'
import { triggerMatches } from '@/lib/triggerMatch'
import { findTemplateMatch } from './webhookHandler'
import { postbackToIncoming } from '@/lib/instagramPostback'
import { validateIceBreakers, buildIceBreakersBody, DEFAULT_ICE_BREAKERS } from '@/lib/instagramIceBreakers'

const row = (id: string, channel: string | null, trigger_words: string[], reply_text: string): TemplateRow => ({ id, channel, trigger_words, reply_text })

// Набор как у боевого агента: особые строки, кодовые слова с маркером @codeword
// и DM-шаблоны-реакции (огонь, срочно, ...) БЕЗ маркера.
const rows: TemplateRow[] = [
  row('ack', 'comment', ['@comment_ack'], 'Ссылка отправлена вам в личные сообщения'),
  row('def', 'comment', ['@comment_default'], 'Напишите нужное слово в директ: СЧЁТ, АКТ'),
  row('att', 'dm', ['@attachment', '@attachment_image'], 'Напишите слово: КОНТРАГЕНТ, СЧЁТ'),
  row('hi', 'dm', ['=здравствуйте', '=привет'], 'Меню слов'),
  row('schet', 'dm', ['^счёт', '^счет', '@codeword'], 'Ссылка на счёт'),
  row('akt', 'dm', ['=акт', '@codeword'], 'Ссылка на акт'),
  row('tovar', 'dm', ['=товар', '@codeword'], 'Ссылка на накладную'),
  row('kontr', 'dm', ['контрагент', 'бин', '@codeword'], 'Ссылка на проверку БИН'),
  row('nalogi', 'dm', ['налоги', '@codeword'], 'Ссылка на налоги'),
  row('fire', 'dm', ['огонь', 'горячее предложение', 'срочно'], 'Спасибо за энергию!'),
  row('review', 'dm', ['удобный сервис', 'фишки платформы'], 'Спасибо за отзыв!'),
  row('margin', 'dm', ['маржа'], 'Ссылка на маржу'),
  row('price', null, ['цена', 'сколько стоит'], 'Тарифы'),
]

describe('служебные маркеры «@» никогда не срабатывают как текст', () => {
  it('triggerMatches не ловит маркер ни точным текстом, ни подстрокой', () => {
    for (const t of ['@comment_ack', '@comment_default', '@attachment', '@attachment_image', '@codeword']) {
      expect(triggerMatches(t, t)).toBe(false)
      expect(triggerMatches(`привет ${t} пока`, t)).toBe(false)
    }
  })
  it('findTemplateMatch: клиент пишет название маркера -- шаблон не срабатывает', () => {
    expect(findTemplateMatch('@comment_ack', rows.map(r => ({ id: r.id, trigger_words: r.trigger_words, reply_text: r.reply_text })))).toBeNull()
    expect(findTemplateMatch('@attachment', rows as any)).toBeNull()
  })
  it('обычные триггеры по-прежнему работают рядом с маркерами', () => {
    expect(findTemplateMatch('Здравствуйте!', rows as any)?.id).toBe('hi')
    expect(findTemplateMatch('Контрагент', rows as any)?.id).toBe('kontr')
  })
})

describe('planCommentReply: кодовое слово в комментарии', () => {
  it('«Контрагент» (подстрока) -> codeword с текстом DM-шаблона', () => {
    const p = planCommentReply(rows, 'Контрагент')
    expect(p).toEqual({ kind: 'codeword', ackText: 'Ссылка отправлена вам в личные сообщения', dmText: 'Ссылка на проверку БИН', templateId: 'kontr' })
  })
  it('режим «^»: «Счёт» и «счета нужны» ловятся, «расчёт» нет', () => {
    expect((planCommentReply(rows, 'Счёт') as any).templateId).toBe('schet')
    expect((planCommentReply(rows, 'счета нужны') as any).templateId).toBe('schet')
    expect(planCommentReply(rows, 'расчёт').kind).toBe('none')
  })
  it('режим «=»: «Акт!» и «  акт 👍» ловятся, «акт сверки обсудим» нет', () => {
    expect((planCommentReply(rows, 'Акт!') as any).templateId).toBe('akt')
    expect((planCommentReply(rows, '  акт 👍') as any).templateId).toBe('akt')
    expect(planCommentReply(rows, 'акт сверки обсудим').kind).toBe('none')
    expect((planCommentReply(rows, 'ТОВАР') as any).templateId).toBe('tovar')
  })
  it('короткий триггер «бин»: с начала слова', () => {
    expect((planCommentReply(rows, 'БИН?') as any).templateId).toBe('kontr')
    expect(planCommentReply(rows, 'кабинет').kind).toBe('none')
  })
  it('DM-шаблоны БЕЗ маркера @codeword (реакции «огонь», «срочно», «удобный сервис», «маржа») не кодовые слова', () => {
    for (const t of ['огонь', 'Срочно!', 'удобный сервис', 'фишки платформы', 'маржа', 'горячее предложение']) {
      expect(planCommentReply(rows, t).kind, t).toBe('none')
    }
  })
  it('«Здравствуйте» и эмодзи НЕ кодовые слова', () => {
    expect(planCommentReply(rows, 'Здравствуйте').kind).toBe('none')
    expect(planCommentReply(rows, '🔥🔥').kind).toBe('none')
    expect(planCommentReply(rows, 'Темеш🥰').kind).toBe('none')
  })
  it('шаблон на все каналы («цена») не кодовое слово: на него отвечает обычный путь', () => {
    expect(planCommentReply(rows, 'какая цена?').kind).toBe('none')
  })
  it('порядок: первым побеждает более ранний DM-шаблон', () => {
    expect((planCommentReply(rows, 'налоги и счёт') as any).templateId).toBe('schet')
  })
  it('без строки @comment_ack режим выключен совсем', () => {
    const without = rows.filter(r => r.id !== 'ack')
    expect(planCommentReply(without, 'Контрагент').kind).toBe('none')
    expect(planCommentReply([], 'Контрагент').kind).toBe('none')
  })
  it('строка @comment_ack с пустым текстом -- режим выключен', () => {
    const blank = rows.map(r => (r.id === 'ack' ? { ...r, reply_text: '  ' } : r))
    expect(planCommentReply(blank, 'Контрагент').kind).toBe('none')
  })
  it('@comment_default находится; нет строки -- null', () => {
    expect(findCommentDefaultText(rows)).toBe('Напишите нужное слово в директ: СЧЁТ, АКТ')
    expect(findCommentDefaultText(rows.filter(r => r.id !== 'def'))).toBeNull()
  })
})

describe('commentDefaultAllowed: защита публичного меню от спама', () => {
  const now = Date.parse('2026-10-29T12:00:00Z')
  const ago = (ms: number) => new Date(now - ms).toISOString()
  const base = { isReply: false, text: 'Здравствуйте', handle: 'ivan', recent: [] as any[], now }
  it('обычный комментарий без истории -- можно', () => {
    expect(commentDefaultAllowed(base)).toBe(true)
  })
  it('ответ в ветке (parent_id) -- нельзя', () => {
    expect(commentDefaultAllowed({ ...base, isReply: true })).toBe(false)
  })
  it('нет букв и цифр (эмодзи, знаки) -- нельзя; буквы или цифры -- можно', () => {
    for (const t of ['🔥', '🔥🔥🔥', '!!!', '  ']) expect(commentDefaultAllowed({ ...base, text: t }), t).toBe(false)
    expect(commentDefaultAllowed({ ...base, text: 'Темеш🥰' })).toBe(true)
    expect(commentDefaultAllowed({ ...base, text: '1' })).toBe(true)
  })
  it('тому же автору не чаще раза в сутки', () => {
    expect(commentDefaultAllowed({ ...base, recent: [{ handle: 'ivan', createdAt: ago(23 * 3600_000) }] })).toBe(false)
    expect(commentDefaultAllowed({ ...base, recent: [{ handle: 'ivan', createdAt: ago(25 * 3600_000) }] })).toBe(true)
    expect(commentDefaultAllowed({ ...base, recent: [{ handle: 'petr', createdAt: ago(60_000) }] })).toBe(true)
  })
  it('не более 5 за час на аккаунт', () => {
    const four = Array.from({ length: 4 }, (_, i) => ({ handle: 'u' + i, createdAt: ago(60_000 * (i + 1)) }))
    expect(commentDefaultAllowed({ ...base, recent: four })).toBe(true)
    expect(commentDefaultAllowed({ ...base, recent: [...four, { handle: 'u9', createdAt: ago(10 * 60_000) }] })).toBe(false)
    // старше часа в лимит аккаунта не входят
    const old = Array.from({ length: 6 }, (_, i) => ({ handle: 'o' + i, createdAt: ago(2 * 3600_000 + i) }))
    expect(commentDefaultAllowed({ ...base, recent: old })).toBe(true)
  })
})

describe('runCommentCodeword: Private Reply', () => {
  const plan = { kind: 'codeword' as const, ackText: 'Ссылка отправлена вам в личные сообщения', dmText: 'Ссылка на проверку БИН', templateId: 'kontr' }
  const mk = (over: Partial<Parameters<typeof runCommentCodeword>[1]> = {}) => {
    const calls: string[] = []
    const deps = {
      sendPrivate: vi.fn(async (t: string) => { calls.push('private:' + t) }),
      replyPublic: vi.fn(async (t: string) => { calls.push('public:' + t) }),
      logOutbound: vi.fn(async (t: string, k: string) => { calls.push(`log-${k}:${t}`) }),
      onError: vi.fn(),
      fallbackPublicText: 'Напишите слово в директ',
      ...over,
    }
    return { deps, calls }
  }

  it('успех: сначала ссылка в директ, потом публичный «ссылка отправлена»', async () => {
    const { deps, calls } = mk()
    const r = await runCommentCodeword(plan, deps)
    expect(r).toEqual({ privateSent: true, publicSent: true })
    expect(calls).toEqual([
      'private:Ссылка на проверку БИН',
      'log-private:Ссылка на проверку БИН',
      'public:Ссылка отправлена вам в личные сообщения',
      'log-public:Ссылка отправлена вам в личные сообщения',
    ])
    expect(deps.onError).not.toHaveBeenCalled()
  })

  it('ошибка Private Reply: публично НЕ обещаем ссылку, а даём меню; обработчик не падает', async () => {
    const { deps } = mk({ sendPrivate: vi.fn(async () => { throw new Error('(#10) already replied') }) })
    const r = await runCommentCodeword(plan, deps)
    expect(r).toEqual({ privateSent: false, publicSent: true })
    expect(deps.replyPublic).toHaveBeenCalledWith('Напишите слово в директ')
    expect(deps.replyPublic).not.toHaveBeenCalledWith(plan.ackText)
    expect(deps.onError).toHaveBeenCalledWith('private', expect.any(Error))
  })

  it('ошибка Private Reply и нет запасного меню: публично молчим', async () => {
    const { deps } = mk({ sendPrivate: vi.fn(async () => { throw new Error('boom') }), fallbackPublicText: null })
    const r = await runCommentCodeword(plan, deps)
    expect(r).toEqual({ privateSent: false, publicSent: false })
    expect(deps.replyPublic).not.toHaveBeenCalled()
  })

  it('ошибка публичного ответа не отменяет уже ушедшую ссылку и не бросает', async () => {
    const { deps } = mk({ replyPublic: vi.fn(async () => { throw new Error('comment gone') }) })
    const r = await runCommentCodeword(plan, deps)
    expect(r).toEqual({ privateSent: true, publicSent: false })
    expect(deps.onError).toHaveBeenCalledWith('public', expect.any(Error))
  })

  it('сбой записи в журнал не бросает', async () => {
    const { deps } = mk({ logOutbound: vi.fn(async () => { throw new Error('db down') }) })
    await expect(runCommentCodeword(plan, deps)).resolves.toEqual({ privateSent: true, publicSent: true })
  })
})

describe('вложения: правило и применимость', () => {
  it('нет строки @attachment -- выключено, всё как раньше', () => {
    const rule = attachmentRuleFromRows(rows.filter(r => r.id !== 'att'))
    expect(rule.enabled).toBe(false)
    for (const t of ['image', 'share', 'ig_reel', 'video', 'audio', undefined]) expect(attachmentMenuApplies(rule, t)).toBe(false)
  })
  it('@attachment без @attachment_image: фото остаётся у ИИ, остальное -- меню, голосовое -- расшифровка', () => {
    const rule = attachmentRuleFromRows([row('a', 'dm', ['@attachment'], 'Меню')])
    expect(rule).toEqual({ enabled: true, images: false, text: 'Меню' })
    expect(attachmentMenuApplies(rule, 'image')).toBe(false)
    expect(attachmentMenuApplies(rule, 'share')).toBe(true)
    expect(attachmentMenuApplies(rule, 'ig_reel')).toBe(true)
    expect(attachmentMenuApplies(rule, 'story_mention')).toBe(true)
    expect(attachmentMenuApplies(rule, 'audio')).toBe(false)
  })
  it('@attachment + @attachment_image: меню и на фото, голосовое всё равно в расшифровку', () => {
    const rule = attachmentRuleFromRows(rows)
    expect(rule.images).toBe(true)
    expect(attachmentMenuApplies(rule, 'image')).toBe(true)
    expect(attachmentMenuApplies(rule, 'audio')).toBe(false)
  })
  it('строка для канала comment не включает меню вложений', () => {
    expect(attachmentRuleFromRows([row('a', 'comment', ['@attachment'], 'Меню')]).enabled).toBe(false)
  })
})

describe('postbackToIncoming', () => {
  const ev = (postback: any, extra: any = {}) => ({ sender: { id: 'u1' }, recipient: { id: 'me' }, timestamp: 123, postback, ...extra })
  it('нормальное нажатие: pb:<mid>, текст = payload, журнал = подпись кнопки', () => {
    expect(postbackToIncoming(ev({ mid: 'm1', title: 'Проверить контрагента по БИН', payload: 'КОНТРАГЕНТ' }))).toEqual({
      senderId: 'u1', externalId: 'pb:m1', text: 'КОНТРАГЕНТ', loggedText: 'Проверить контрагента по БИН',
    })
  })
  it('без mid идентификатор стабилен для повторной доставки', () => {
    const a = postbackToIncoming(ev({ title: 'T', payload: 'СЧЁТ' }))!
    const b = postbackToIncoming(ev({ title: 'T', payload: 'СЧЁТ' }))!
    expect(a.externalId).toBe(b.externalId)
    expect(a.externalId.startsWith('pb:')).toBe(true)
  })
  it('пустой payload, нет отправителя, payload сценария btn: -- пропуск', () => {
    expect(postbackToIncoming(ev({ mid: 'm', payload: '  ' }))).toBeNull()
    expect(postbackToIncoming({ postback: { payload: 'X' } })).toBeNull()
    expect(postbackToIncoming(ev({ mid: 'm', payload: 'btn:s1:0' }))).toBeNull()
  })
})

describe('ice breakers: тело запроса', () => {
  it('набор по умолчанию: ровно 4, формат Meta (locale: 'default' обязателен, иначе «Invalid parameter»)', () => {
    expect(DEFAULT_ICE_BREAKERS.map(i => i.payload)).toEqual(['КОНТРАГЕНТ', 'СЧЁТ', 'НАЛОГИ', 'ТОВАР'])
    const body = buildIceBreakersBody(DEFAULT_ICE_BREAKERS)
    expect(body.platform).toBe('instagram')
    expect(body.ice_breakers).toHaveLength(1)
    expect(body.ice_breakers[0].locale).toBe('default')
    expect(Object.keys(body.ice_breakers[0])).toEqual(['call_to_actions'])
    expect(body.ice_breakers[0].call_to_actions[0]).toEqual({ question: 'Проверить контрагента по БИН', payload: 'КОНТРАГЕНТ' })
    expect(body.ice_breakers[0].call_to_actions).toHaveLength(4)
  })
  it('каждое слово набора -- действительно срабатывающее DM-слово', () => {
    // payload идёт в конвейер как обычный текст: тот же матчер, что и для набранного руками.
    const w = (t: string) => rows.some(r => r.channel === 'dm' && r.trigger_words.some(x => triggerMatches(t.toLowerCase(), x)))
    for (const i of DEFAULT_ICE_BREAKERS) expect(w(i.payload), i.payload).toBe(true)
  })
  it('валидация: больше 4, пусто, длинный вопрос', () => {
    expect(validateIceBreakers([]).ok).toBe(false)
    expect(validateIceBreakers([...DEFAULT_ICE_BREAKERS, { question: 'x', payload: 'y' }]).ok).toBe(false)
    expect(validateIceBreakers([{ question: 'я'.repeat(81), payload: 'y' }]).ok).toBe(false)
    expect(validateIceBreakers([{ question: 'q', payload: '' }]).ok).toBe(false)
    expect(validateIceBreakers('x').ok).toBe(false)
  })
  it('в текстах набора нет длинного тире', () => {
    expect(JSON.stringify(DEFAULT_ICE_BREAKERS)).not.toContain('—')
  })
})
