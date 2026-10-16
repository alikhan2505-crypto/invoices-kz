import { describe, it, expect } from 'vitest'
import {
  businessStepComplete, hasWorkingChannel, canLaunch, resumeStep, parseStepParam, canGoNext,
  parseLaunchMode, isDraftAgent, shouldQueueForReview, isMissingColumnError, canUseSetupWizard,
  maxReachableStep, clampStep, launchKnowledgeOk,
  MIN_BUSINESS_DESCRIPTION_CHARS, DEFAULT_LAUNCH_MODE,
} from './setupWizard'

const long = 'а'.repeat(MIN_BUSINESS_DESCRIPTION_CHARS)

describe('canUseSetupWizard', () => {
  it('пока мастер только для админов', () => {
    expect(canUseSetupWizard(true)).toBe(true)
    expect(canUseSetupWizard(false)).toBe(false)
  })
})

describe('businessStepComplete', () => {
  it('80 символов -- хватает, 79 -- нет', () => {
    expect(businessStepComplete(long, false)).toBe(true)
    expect(businessStepComplete(long.slice(1), false)).toBe(false)
  })
  it('пробелы по краям не считаются', () => {
    expect(businessStepComplete(`   ${long.slice(1)}   `, false)).toBe(false)
  })
  it('с Kaspi Bot описание не обязательно', () => {
    expect(businessStepComplete('', true)).toBe(true)
  })
})

describe('каналы и запуск', () => {
  it('без подключений запустить нельзя', () => {
    expect(hasWorkingChannel([])).toBe(false)
    expect(canLaunch([])).toBe(false)
  })
  it('истёкший токен -- не канал', () => {
    expect(canLaunch([{ channel: 'instagram', status: 'token_expired' }])).toBe(false)
  })
  it('чат для сайта считается каналом', () => {
    expect(canLaunch([{ channel: 'website', status: 'active' }])).toBe(true)
  })
})

describe('resumeStep', () => {
  it('нет канала -- шаг 1', () => {
    expect(resumeStep({ connections: [], description: long, hasKaspiShop: false })).toBe(1)
  })
  it('канал есть, описания мало -- шаг 2', () => {
    expect(resumeStep({ connections: [{ channel: 'whatsapp', status: 'active' }], description: 'кофе', hasKaspiShop: false })).toBe(2)
  })
  it('всё есть -- сразу запуск', () => {
    expect(resumeStep({ connections: [{ channel: 'whatsapp', status: 'active' }], description: long, hasKaspiShop: false })).toBe(4)
    expect(resumeStep({ connections: [{ channel: 'website', status: 'active' }], description: '', hasKaspiShop: true })).toBe(4)
  })
})

describe('parseStepParam', () => {
  it('принимает 1..4', () => {
    expect(parseStepParam('1')).toBe(1)
    expect(parseStepParam('4')).toBe(4)
  })
  it('остальное -- null', () => {
    for (const v of ['0', '5', 'x', '2.5', '', null, undefined]) expect(parseStepParam(v as any)).toBeNull()
  })
})

describe('canGoNext', () => {
  const base = { description: '', hasKaspiShop: false, name: 'Кофейня' }
  it('с шага канала можно уйти и без канала («Подключу позже»)', () => {
    expect(canGoNext(1, base)).toBe(true)
  })
  it('шаг «О бизнесе» требует описание или Kaspi Bot и название', () => {
    expect(canGoNext(2, base)).toBe(false)
    expect(canGoNext(2, { ...base, description: long })).toBe(true)
    expect(canGoNext(2, { ...base, hasKaspiShop: true })).toBe(true)
    expect(canGoNext(2, { ...base, hasKaspiShop: true, name: '  ' })).toBe(false)
  })
  it('с последнего шага «дальше» нет -- там «Запустить»', () => {
    expect(canGoNext(3, base)).toBe(true)
    expect(canGoNext(4, base)).toBe(false)
  })
})

describe('режим запуска', () => {
  it('по умолчанию -- отвечать сразу', () => {
    expect(DEFAULT_LAUNCH_MODE).toBe('active')
  })
  it('parseLaunchMode пропускает только два значения', () => {
    expect(parseLaunchMode('active')).toBe('active')
    expect(parseLaunchMode('training')).toBe('training')
    expect(parseLaunchMode('paused')).toBeNull()
    expect(parseLaunchMode(undefined)).toBeNull()
  })
})

describe('isDraftAgent', () => {
  it('колонка есть и пуста -- черновик', () => {
    expect(isDraftAgent({ id: 'a', launched_at: null })).toBe(true)
  })
  it('запущен -- не черновик', () => {
    expect(isDraftAgent({ id: 'a', launched_at: '2026-10-16T10:00:00Z' })).toBe(false)
  })
  it('до миграции колонки нет -- как раньше, не черновик', () => {
    expect(isDraftAgent({ id: 'a' })).toBe(false)
    expect(isDraftAgent(null)).toBe(false)
  })
  it('включён и с рабочим каналом -- уже отвечает клиентам, не черновик (A4)', () => {
    const live = [{ channel: 'whatsapp', status: 'active' }]
    expect(isDraftAgent({ id: 'a', launched_at: null, is_enabled: true }, live)).toBe(false)
    expect(isDraftAgent({ id: 'a', launched_at: null, is_enabled: null }, live)).toBe(false)
  })
  it('выключен (черновик мастера) или канал не работает -- черновик', () => {
    expect(isDraftAgent({ id: 'a', launched_at: null, is_enabled: false }, [{ channel: 'whatsapp', status: 'active' }])).toBe(true)
    expect(isDraftAgent({ id: 'a', launched_at: null, is_enabled: true }, [{ channel: 'instagram', status: 'token_expired' }])).toBe(true)
    expect(isDraftAgent({ id: 'a', launched_at: null, is_enabled: true }, [])).toBe(true)
  })
})

describe('maxReachableStep / clampStep (B10)', () => {
  it('без описания от 80 символов и без Kaspi Bot -- не дальше шага 2', () => {
    expect(maxReachableStep({ name: 'Кофейня', description: 'коротко', hasKaspiShop: false })).toBe(2)
    expect(clampStep(4, 2, 1)).toBe(2)
    expect(clampStep(3, 2, 1)).toBe(2)
  })
  it('пустое название тоже держит на шаге 2', () => {
    expect(maxReachableStep({ name: '  ', description: long, hasKaspiShop: false })).toBe(2)
  })
  it('описание или Kaspi Bot -- до запуска', () => {
    expect(maxReachableStep({ name: 'Кофейня', description: long, hasKaspiShop: false })).toBe(4)
    expect(maxReachableStep({ name: 'Кофейня', description: '', hasKaspiShop: true })).toBe(4)
    expect(clampStep(3, 4, 1)).toBe(3)
  })
  it('назад -- куда угодно; без ?step= -- fallback, тоже прижатый', () => {
    expect(clampStep(1, 4, 4)).toBe(1)
    expect(clampStep(null, 4, 4)).toBe(4)
    expect(clampStep(null, 2, 4)).toBe(2)
  })
})

describe('launchKnowledgeOk (серверный порог запуска, B10)', () => {
  it('80 символов или Kaspi Bot', () => {
    expect(launchKnowledgeOk(long, false)).toBe(true)
    expect(launchKnowledgeOk('коротко', true)).toBe(true)
    expect(launchKnowledgeOk('коротко', false)).toBe(false)
    expect(launchKnowledgeOk(null, false)).toBe(false)
    expect(launchKnowledgeOk('   ' + 'а'.repeat(MIN_BUSINESS_DESCRIPTION_CHARS - 1) + '   ', false)).toBe(false)
  })
})

describe('shouldQueueForReview', () => {
  it('обучение ставит ответ в очередь', () => {
    expect(shouldQueueForReview('whatsapp', 'training')).toBe(true)
    expect(shouldQueueForReview('telegram', 'training')).toBe(true)
  })
  it('чат для сайта всегда отвечает сразу', () => {
    expect(shouldQueueForReview('website', 'training')).toBe(false)
  })
  it('активный агент не ставит в очередь', () => {
    expect(shouldQueueForReview('whatsapp', 'active')).toBe(false)
  })
})

describe('isMissingColumnError', () => {
  it('PGRST204 при записи', () => {
    expect(isMissingColumnError({ code: 'PGRST204', message: "Could not find the 'launched_at' column of 'ai_agents' in the schema cache" }, 'launched_at')).toBe(true)
  })
  it('42703 при чтении', () => {
    expect(isMissingColumnError({ code: '42703', message: 'column ai_agents.launched_at does not exist' }, 'launched_at')).toBe(true)
  })
  it('другая колонка или другая ошибка -- нет', () => {
    expect(isMissingColumnError({ code: '42703', message: 'column ai_agents.foo does not exist' }, 'launched_at')).toBe(false)
    expect(isMissingColumnError({ code: '23505', message: 'duplicate key' }, 'launched_at')).toBe(false)
    expect(isMissingColumnError(null, 'launched_at')).toBe(false)
  })
})
