import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeFakeDb } from '@/lib/fakeDb.testkit'
import { COUNTER_TABLE } from '@/lib/toolQuota'
import { windowKey, hourBucket } from '@/lib/windowLimits'
import {
  claimInvoicePushSlots, resetInvoicePushMemory, secondsToNextHour,
  type InvoicePushClaim,
} from './invoicePushLimits'
import { PHONE_HOURLY_LIMIT, IP_HOURLY_LIMIT } from './phonePushLimits'

const h = (ip: string | null) => new Headers(ip ? { 'x-forwarded-for': ip } : {})
// 10:30 UTC -- до конца часового окна ровно 30 минут.
const NOW = Date.UTC(2026, 10, 3, 10, 30)
const pad = (i: number) => String(i).padStart(2, '0')
const phoneN = (i: number) => `+7 700 000 00 ${pad(i)}`

// Лимиты: ключи счётчиков записаны литералами нарочно -- это те же ключи, что
// у /api/payment/create-phone и /api/kaspi/wallet/topup-phone (общий лимит на номер).
const PHONE_KEY_PREFIX = 'pushphone'
const IP_KEY_PREFIX = 'puship'

beforeEach(() => {
  resetInvoicePushMemory()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

function okClaim(c: InvoicePushClaim) {
  if (!c.ok) throw new Error(`expected ok claim, got blocked by ${c.scope}`)
  return c
}

describe('secondsToNextHour', () => {
  it('counts to the next UTC hour boundary, never below 1', () => {
    expect(secondsToNextHour(NOW)).toBe(1800)
    expect(secondsToNextHour(Date.UTC(2026, 10, 3, 11, 0))).toBe(3600)
    expect(secondsToNextHour(Date.UTC(2026, 10, 3, 10, 59, 59, 999))).toBe(1)
  })
})

describe('claimInvoicePushSlots: per phone', () => {
  it('lets PHONE_HOURLY_LIMIT pushes to one number through from different IPs, then blocks with Retry-After to the end of the hour', async () => {
    const db = makeFakeDb()
    for (let i = 0; i < PHONE_HOURLY_LIMIT; i++) {
      expect((await claimInvoicePushSlots(db.client, h(`1.1.1.${i}`), '+7 777 123 45 67', NOW)).ok).toBe(true)
    }
    expect(await claimInvoicePushSlots(db.client, h('9.9.9.9'), '+7 777 123 45 67', NOW))
      .toEqual({ ok: false, scope: 'phone', retryAfterSec: 1800 })
  })

  it('counts +7 / 8 / 7 and any punctuation of one number as the same phone', async () => {
    const db = makeFakeDb()
    expect((await claimInvoicePushSlots(db.client, h('1.1.1.1'), '+7 777 123 45 67', NOW)).ok).toBe(true)
    expect((await claimInvoicePushSlots(db.client, h('1.1.1.2'), '87771234567', NOW)).ok).toBe(true)
    expect((await claimInvoicePushSlots(db.client, h('1.1.1.3'), '7 (777) 123-45-67', NOW)).ok).toBe(true)
    const res = await claimInvoicePushSlots(db.client, h('1.1.1.4'), '77771234567', NOW)
    expect(res.ok).toBe(false)
  })

  it('a number that is over the limit does not eat the IP budget of the one asking', async () => {
    const db = makeFakeDb()
    for (let i = 0; i < PHONE_HOURLY_LIMIT; i++) await claimInvoicePushSlots(db.client, h(`2.2.2.${i}`), '+7 777 000 00 00', NOW)
    // Номер исчерпан: попытки с нового IP получают отказ...
    for (let i = 0; i < 5; i++) {
      expect((await claimInvoicePushSlots(db.client, h('3.3.3.3'), '+7 777 000 00 00', NOW)).ok).toBe(false)
    }
    // ...но не списывают бюджет этого IP: ему по-прежнему доступны все IP_HOURLY_LIMIT других номеров.
    for (let i = 0; i < IP_HOURLY_LIMIT; i++) {
      expect((await claimInvoicePushSlots(db.client, h('3.3.3.3'), phoneN(i), NOW)).ok).toBe(true)
    }
  })

  it('without a resolvable IP only the per-phone limit applies (no global bucket)', async () => {
    const db = makeFakeDb()
    for (let i = 0; i < IP_HOURLY_LIMIT + 5; i++) {
      expect((await claimInvoicePushSlots(db.client, h(null), phoneN(i), NOW)).ok).toBe(true)
    }
    const keys = db.tables[COUNTER_TABLE].map(r => r.key as string)
    expect(keys.length).toBeGreaterThan(0)
    expect(keys.every(k => k.startsWith(`${PHONE_KEY_PREFIX}:`))).toBe(true)
  })
})

describe('claimInvoicePushSlots: per IP', () => {
  it('lets IP_HOURLY_LIMIT pushes to different numbers through, then blocks that IP only', async () => {
    const db = makeFakeDb()
    for (let i = 0; i < IP_HOURLY_LIMIT; i++) {
      expect((await claimInvoicePushSlots(db.client, h('4.4.4.4'), phoneN(i), NOW)).ok).toBe(true)
    }
    expect(await claimInvoicePushSlots(db.client, h('4.4.4.4'), phoneN(50), NOW))
      .toEqual({ ok: false, scope: 'ip', retryAfterSec: 1800 })
    expect((await claimInvoicePushSlots(db.client, h('4.4.4.5'), phoneN(50), NOW)).ok).toBe(true)
  })

  it('an IP that is over the limit never touches the budget of the victim number', async () => {
    const db = makeFakeDb()
    for (let i = 0; i < IP_HOURLY_LIMIT; i++) await claimInvoicePushSlots(db.client, h('5.5.5.5'), phoneN(i), NOW)
    expect((await claimInvoicePushSlots(db.client, h('5.5.5.5'), '+7 777 111 11 11', NOW)).ok).toBe(false)
    // Жертве достаются все её PHONE_HOURLY_LIMIT слотов с других адресов.
    for (let i = 0; i < PHONE_HOURLY_LIMIT; i++) {
      expect((await claimInvoicePushSlots(db.client, h(`6.6.6.${i}`), '+7 777 111 11 11', NOW)).ok).toBe(true)
    }
  })

  it('treats one IPv6 /64 as one address (privacy-extension tails do not mint fresh limits)', async () => {
    const db = makeFakeDb()
    for (let i = 0; i < IP_HOURLY_LIMIT; i++) {
      expect((await claimInvoicePushSlots(db.client, h(`2001:db8:1:2::${i + 1}`), phoneN(i), NOW)).ok).toBe(true)
    }
    expect((await claimInvoicePushSlots(db.client, h('2001:db8:1:2:aaaa:bbbb:cccc:dddd'), phoneN(60), NOW)).ok).toBe(false)
    expect((await claimInvoicePushSlots(db.client, h('2001:db8:1:3::1'), phoneN(60), NOW)).ok).toBe(true)
  })
})

describe('claimInvoicePushSlots: two layers', () => {
  it('the DB counter is shared across serverless instances (a cold instance does not reset it)', async () => {
    const db = makeFakeDb()
    for (let i = 0; i < PHONE_HOURLY_LIMIT; i++) await claimInvoicePushSlots(db.client, h(`7.7.7.${i}`), '+7 777 222 22 22', NOW)
    resetInvoicePushMemory() // другой инстанс: своей памяти о запросах нет
    const byPhone = await claimInvoicePushSlots(db.client, h('7.7.7.99'), '+7 777 222 22 22', NOW)
    expect(byPhone).toMatchObject({ ok: false, scope: 'phone' })

    for (let i = 0; i < IP_HOURLY_LIMIT; i++) await claimInvoicePushSlots(db.client, h('8.8.8.8'), phoneN(i), NOW)
    resetInvoicePushMemory()
    const byIp = await claimInvoicePushSlots(db.client, h('8.8.8.8'), phoneN(70), NOW)
    expect(byIp).toMatchObject({ ok: false, scope: 'ip' })
  })

  it('instance memory still limits when the DB counter is broken (fail-open on DB, not on abuse)', async () => {
    const db = makeFakeDb()
    db.failTable = COUNTER_TABLE
    for (let i = 0; i < PHONE_HOURLY_LIMIT; i++) {
      expect((await claimInvoicePushSlots(db.client, h(`9.9.9.${i}`), '+7 777 333 33 33', NOW)).ok).toBe(true)
    }
    expect(await claimInvoicePushSlots(db.client, h('9.9.9.99'), '+7 777 333 33 33', NOW))
      .toMatchObject({ ok: false, scope: 'phone' })

    for (let i = 0; i < IP_HOURLY_LIMIT; i++) {
      expect((await claimInvoicePushSlots(db.client, h('10.0.0.1'), phoneN(i), NOW)).ok).toBe(true)
    }
    expect(await claimInvoicePushSlots(db.client, h('10.0.0.1'), phoneN(80), NOW))
      .toMatchObject({ ok: false, scope: 'ip' })
  })

  it('does not block a payment when the DB counter is broken and memory has room', async () => {
    const db = makeFakeDb()
    db.failTable = COUNTER_TABLE
    expect((await claimInvoicePushSlots(db.client, h('10.0.0.2'), '+7 777 444 44 44', NOW)).ok).toBe(true)
  })

  it('shares its counters with the other push routes (same keys as create-phone / topup-phone)', async () => {
    const bucket = hourBucket(NOW)
    const db = makeFakeDb({
      [COUNTER_TABLE]: [
        { key: windowKey(PHONE_KEY_PREFIX, '7771234567', bucket), day: '2000-01-01', count: PHONE_HOURLY_LIMIT },
        { key: windowKey(IP_KEY_PREFIX, '11.1.1.1', bucket), day: '2000-01-01', count: IP_HOURLY_LIMIT },
      ],
    })
    expect(await claimInvoicePushSlots(db.client, h('11.2.2.2'), '+7 777 123 45 67', NOW)).toMatchObject({ ok: false, scope: 'phone' })
    expect(await claimInvoicePushSlots(db.client, h('11.1.1.1'), '+7 705 000 00 00', NOW)).toMatchObject({ ok: false, scope: 'ip' })
    // Чужие номер и IP не задеты.
    expect((await claimInvoicePushSlots(db.client, h('11.2.2.2'), '+7 705 000 00 00', NOW)).ok).toBe(true)
  })

  it('limits reset in the next hour, in the DB and in memory', async () => {
    const db = makeFakeDb()
    for (let i = 0; i < PHONE_HOURLY_LIMIT; i++) await claimInvoicePushSlots(db.client, h('12.0.0.1'), '+7 777 555 55 55', NOW)
    expect((await claimInvoicePushSlots(db.client, h('12.0.0.1'), '+7 777 555 55 55', NOW)).ok).toBe(false)
    expect((await claimInvoicePushSlots(db.client, h('12.0.0.1'), '+7 777 555 55 55', NOW + 3_600_000)).ok).toBe(true)
  })

  it('stores no raw phone or IP in the database', async () => {
    const db = makeFakeDb()
    await claimInvoicePushSlots(db.client, h('13.13.13.13'), '+7 777 123 45 67', NOW)
    const dump = JSON.stringify(db.tables[COUNTER_TABLE])
    expect(dump).not.toContain('7771234567')
    expect(dump).not.toContain('13.13.13.13')
  })
})

describe('claimInvoicePushSlots: release', () => {
  it('returns the slots in the DB and in memory, so a push that never happened costs nothing', async () => {
    const db = makeFakeDb()
    const claims: Array<Extract<InvoicePushClaim, { ok: true }>> = []
    for (let i = 0; i < PHONE_HOURLY_LIMIT; i++) {
      claims.push(okClaim(await claimInvoicePushSlots(db.client, h('14.0.0.1'), '+7 777 666 66 66', NOW)))
    }
    expect((await claimInvoicePushSlots(db.client, h('14.0.0.1'), '+7 777 666 66 66', NOW)).ok).toBe(false)

    await claims[0].release()
    const phoneRow = db.tables[COUNTER_TABLE].find(r => (r.key as string).startsWith(`${PHONE_KEY_PREFIX}:`))!
    const ipRow = db.tables[COUNTER_TABLE].find(r => (r.key as string).startsWith(`${IP_KEY_PREFIX}:`))!
    expect(phoneRow.count).toBe(PHONE_HOURLY_LIMIT - 1)
    expect(ipRow.count).toBe(PHONE_HOURLY_LIMIT - 1)

    expect((await claimInvoicePushSlots(db.client, h('14.0.0.1'), '+7 777 666 66 66', NOW)).ok).toBe(true)
    expect((await claimInvoicePushSlots(db.client, h('14.0.0.1'), '+7 777 666 66 66', NOW)).ok).toBe(false)
  })

  it('release({ keepIp: true }) returns only the number slot: the address keeps paying for the request', async () => {
    const db = makeFakeDb()
    const a = okClaim(await claimInvoicePushSlots(db.client, h('18.0.0.1'), '+7 777 515 15 15', NOW))
    await a.release({ keepIp: true })
    await a.release({ keepIp: true })
    const phoneRow = db.tables[COUNTER_TABLE].find(r => (r.key as string).startsWith(`${PHONE_KEY_PREFIX}:`))
    const ipRow = db.tables[COUNTER_TABLE].find(r => (r.key as string).startsWith(`${IP_KEY_PREFIX}:`))!
    expect(phoneRow?.count ?? 0).toBe(0)
    expect(ipRow.count).toBe(1)
    // и память инстанса: IP_HOURLY_LIMIT запросов, «не дошедших до push», исчерпывают адрес
    resetInvoicePushMemory()
    const db2 = makeFakeDb()
    for (let i = 0; i < IP_HOURLY_LIMIT; i++) {
      await okClaim(await claimInvoicePushSlots(db2.client, h('18.0.0.2'), phoneN(i), NOW)).release({ keepIp: true })
    }
    expect(await claimInvoicePushSlots(db2.client, h('18.0.0.2'), phoneN(60), NOW))
      .toEqual({ ok: false, scope: 'ip', retryAfterSec: 1800 })
    // а другой адрес и сам номер свободны
    expect((await claimInvoicePushSlots(db2.client, h('18.0.0.3'), phoneN(0), NOW)).ok).toBe(true)
  })

  it('a full release() after keepIp still returns the address slot, once', async () => {
    const db = makeFakeDb()
    const a = okClaim(await claimInvoicePushSlots(db.client, h('19.0.0.1'), '+7 777 616 16 16', NOW))
    await a.release({ keepIp: true })
    await a.release()
    await a.release()
    const ipRow = db.tables[COUNTER_TABLE].find(r => (r.key as string).startsWith(`${IP_KEY_PREFIX}:`))
    expect(ipRow?.count ?? 0).toBe(0)
  })

  it('is idempotent: calling it twice returns the slot once', async () => {
    const db = makeFakeDb()
    const a = okClaim(await claimInvoicePushSlots(db.client, h('15.0.0.1'), '+7 777 777 77 77', NOW))
    okClaim(await claimInvoicePushSlots(db.client, h('15.0.0.2'), '+7 777 777 77 77', NOW))
    await a.release()
    await a.release()
    const phoneRow = db.tables[COUNTER_TABLE].find(r => (r.key as string).startsWith(`${PHONE_KEY_PREFIX}:`))!
    expect(phoneRow.count).toBe(1)
  })

  it('returns memory slots even when the DB counter is broken', async () => {
    const db = makeFakeDb()
    db.failTable = COUNTER_TABLE
    const claims: Array<Extract<InvoicePushClaim, { ok: true }>> = []
    for (let i = 0; i < PHONE_HOURLY_LIMIT; i++) {
      claims.push(okClaim(await claimInvoicePushSlots(db.client, h('16.0.0.1'), '+7 777 888 88 88', NOW)))
    }
    expect((await claimInvoicePushSlots(db.client, h('16.0.0.1'), '+7 777 888 88 88', NOW)).ok).toBe(false)
    await claims[1].release()
    expect((await claimInvoicePushSlots(db.client, h('16.0.0.1'), '+7 777 888 88 88', NOW)).ok).toBe(true)
  })
})

describe('claimInvoicePushSlots: input that is not a phone', () => {
  it.each([undefined, null, '', 'abc', '12345', '+7 777 12', 12345, {}])(
    'takes no slots and touches no counters for %j',
    async (phone) => {
      const db = makeFakeDb()
      for (let i = 0; i < 50; i++) {
        expect((await claimInvoicePushSlots(db.client, h('17.0.0.1'), phone, NOW)).ok).toBe(true)
      }
      expect(db.calls.count).toBe(0)
      expect(db.tables[COUNTER_TABLE] ?? []).toHaveLength(0)
    },
  )
})
