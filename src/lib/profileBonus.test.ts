import { describe, it, expect } from 'vitest'
import {
  decideRequisitesBonus, decideBankBonus, decideSignatureBonus,
  requisitesPrecheck, bankPrecheck, assessInkCoverage, storageObjectFromUrl, isProfileBonusBlock,
  pickBestImageCheck, isTerminalBonusReason, blockToFix,
} from './profileBonus'

const user = { isAdmin: false, deleted: false }
const goodProfile = { bin_iin: '040340001997', company_name: 'ТОО «Ромашка»' }
const goodAccount = { iik: 'KZ86125KZT5004100100', bik: 'KCJBKZKX' }

describe('requisites bonus', () => {
  it('is eligible with a valid BIN, a name and a registry hit — and carries the BIN', () => {
    expect(decideRequisitesBonus(user, goodProfile, 'found')).toEqual({ eligible: true, bin: '040340001997' })
    expect(decideRequisitesBonus(user, { ...goodProfile, bin_iin: '0403 4000 1997' }, 'found')).toEqual({ eligible: true, bin: '040340001997' })
  })

  it('refuses typos, missing data and registry misses', () => {
    expect(decideRequisitesBonus(user, { ...goodProfile, bin_iin: '040340001996' }, 'found')).toEqual({ eligible: false, reason: 'bin_invalid' })
    expect(decideRequisitesBonus(user, { ...goodProfile, bin_iin: '' }, 'found')).toEqual({ eligible: false, reason: 'bin_missing' })
    expect(decideRequisitesBonus(user, { ...goodProfile, company_name: '  ' }, 'found')).toEqual({ eligible: false, reason: 'company_name_missing' })
    expect(decideRequisitesBonus(user, goodProfile, 'notfound')).toEqual({ eligible: false, reason: 'bin_not_in_registry' })
  })

  it('treats an unreachable registry as "try later", not as not found', () => {
    expect(decideRequisitesBonus(user, goodProfile, 'unavailable')).toEqual({ eligible: false, reason: 'registry_unavailable' })
  })

  it('never pays admins or deleted accounts', () => {
    expect(decideRequisitesBonus({ isAdmin: true, deleted: false }, goodProfile, 'found')).toEqual({ eligible: false, reason: 'admin' })
    expect(decideRequisitesBonus({ isAdmin: false, deleted: true }, goodProfile, 'found')).toEqual({ eligible: false, reason: 'deleted' })
  })

  it('precheck needs no registry', () => {
    expect(requisitesPrecheck(goodProfile).eligible).toBe(true)
  })
})

describe('bank bonus', () => {
  it('is eligible with one valid IIK + BIK and a verified BIN, bound to that BIN', () => {
    expect(decideBankBonus(user, goodProfile, [goodAccount], 'found')).toEqual({ eligible: true, bin: '040340001997' })
  })

  it('one good account among bad ones is enough', () => {
    expect(decideBankBonus(user, goodProfile, [{ iik: 'KZ00', bik: 'X' }, goodAccount], 'found').eligible).toBe(true)
  })

  it('refuses missing, invalid or BIK-less accounts', () => {
    expect(bankPrecheck([])).toEqual({ eligible: false, reason: 'bank_missing' })
    expect(bankPrecheck([{ iik: 'KZ86125KZT5004100101', bik: 'KCJBKZKX' }])).toEqual({ eligible: false, reason: 'iik_invalid' })
    expect(bankPrecheck([{ iik: goodAccount.iik, bik: ' ' }])).toEqual({ eligible: false, reason: 'bik_missing' })
  })

  it('requires the profile BIN to be verified too', () => {
    expect(decideBankBonus(user, { ...goodProfile, bin_iin: '123' }, [goodAccount], 'found')).toEqual({ eligible: false, reason: 'bin_invalid' })
    expect(decideBankBonus(user, goodProfile, [goodAccount], 'notfound')).toEqual({ eligible: false, reason: 'bin_not_in_registry' })
  })
})

describe('signature bonus', () => {
  it('maps the image check', () => {
    expect(decideSignatureBonus(user, 'ok')).toEqual({ eligible: true, bin: null })
    expect(decideSignatureBonus(user, 'missing')).toEqual({ eligible: false, reason: 'signature_missing' })
    expect(decideSignatureBonus(user, 'blank')).toEqual({ eligible: false, reason: 'signature_blank' })
    expect(decideSignatureBonus(user, 'invalid')).toEqual({ eligible: false, reason: 'signature_invalid' })
    expect(decideSignatureBonus({ isAdmin: true, deleted: false }, 'ok')).toEqual({ eligible: false, reason: 'admin' })
  })

  it('tells a dark stamp photo and an empty stamp apart from an empty drawn signature', () => {
    expect(decideSignatureBonus(user, 'dark', 'stamp')).toEqual({ eligible: false, reason: 'image_too_dark' })
    expect(decideSignatureBonus(user, 'blank', 'stamp')).toEqual({ eligible: false, reason: 'stamp_blank' })
    expect(decideSignatureBonus(user, 'blank', 'signature')).toEqual({ eligible: false, reason: 'signature_blank' })
  })

  it('takes the better of signature and stamp', () => {
    expect(pickBestImageCheck([{ check: 'missing', kind: 'signature' }, { check: 'ok', kind: 'stamp' }])).toEqual({ check: 'ok', kind: 'stamp' })
    expect(pickBestImageCheck([{ check: 'blank', kind: 'signature' }, { check: 'dark', kind: 'stamp' }])).toEqual({ check: 'dark', kind: 'stamp' })
    expect(pickBestImageCheck([{ check: 'missing', kind: 'signature' }, { check: 'missing', kind: 'stamp' }]).check).toBe('missing')
  })
})

describe('bonus card helpers', () => {
  it('treats only unfixable reasons as terminal', () => {
    expect(isTerminalBonusReason('bin_already_rewarded')).toBe(true)
    expect(isTerminalBonusReason('bin_invalid')).toBe(false)
    expect(isTerminalBonusReason('registry_unavailable')).toBe(false)
    expect(isTerminalBonusReason(undefined)).toBe(false)
  })

  it('sends a bank row with a requisites problem to the requisites page', () => {
    expect(blockToFix('bank', 'bin_missing')).toBe('requisites')
    expect(blockToFix('bank', 'bin_invalid')).toBe('requisites')
    expect(blockToFix('bank', 'company_name_missing')).toBe('requisites')
    expect(blockToFix('bank', 'bin_not_in_registry')).toBe('requisites')
    expect(blockToFix('bank', 'iik_invalid')).toBe('bank')
    expect(blockToFix('bank', undefined)).toBe('bank')
    expect(blockToFix('signature', 'bin_missing')).toBe('signature')
  })
})

describe('assessInkCoverage', () => {
  const size = 100 * 50
  it('flags an empty (all white) canvas as blank', () => {
    expect(assessInkCoverage(new Uint8Array(size).fill(255))).toBe('blank')
  })
  it('flags a uniform dark fill as dark and a uniform light one as blank', () => {
    expect(assessInkCoverage(new Uint8Array(size).fill(30))).toBe('dark')
    expect(assessInkCoverage(new Uint8Array(size).fill(230))).toBe('blank')
  })
  it('flags an almost entirely dark image as dark', () => {
    const px = new Uint8Array(size).fill(90)
    for (let i = 0; i < 200; i++) px[i] = 250
    expect(assessInkCoverage(px)).toBe('dark')
  })
  it('accepts a short stroke counted in pixels, not as a share of the area', () => {
    const px = new Uint8Array(256 * 85).fill(255)
    for (let x = 10; x < 36; x++) { px[40 * 256 + x] = 60; px[41 * 256 + x] = 120 }
    expect(assessInkCoverage(px)).toBe('ok')
  })
  it('flags a single dot as blank', () => {
    const px = new Uint8Array(size).fill(255)
    px[10] = 0
    expect(assessInkCoverage(px)).toBe('blank')
  })
  it('accepts a few strokes', () => {
    const px = new Uint8Array(size).fill(255)
    for (let x = 10; x < 90; x++) { px[25 * 100 + x] = 20; px[26 * 100 + x] = 20 }
    expect(assessInkCoverage(px)).toBe('ok')
  })
  it('handles an empty buffer', () => {
    expect(assessInkCoverage(new Uint8Array(0))).toBe('blank')
  })
})

describe('storageObjectFromUrl', () => {
  const uid = '11111111-2222-3333-4444-555555555555'
  const base = 'https://x.supabase.co/storage/v1/object/public'
  it('extracts own objects from the two buckets', () => {
    expect(storageObjectFromUrl(`${base}/signatures/${uid}/signature.png?t=1`, uid)).toEqual({ bucket: 'signatures', path: `${uid}/signature.png` })
    expect(storageObjectFromUrl(`${base}/stamps/${uid}/stamp.png`, uid)).toEqual({ bucket: 'stamps', path: `${uid}/stamp.png` })
  })
  it('refuses other users, other buckets, traversal and arbitrary URLs', () => {
    expect(storageObjectFromUrl(`${base}/signatures/someone-else/signature.png`, uid)).toBeNull()
    expect(storageObjectFromUrl(`${base}/logos/${uid}/logo.png`, uid)).toBeNull()
    expect(storageObjectFromUrl(`${base}/signatures/${uid}/../other/x.png`, uid)).toBeNull()
    expect(storageObjectFromUrl('https://evil.example/a.png', uid)).toBeNull()
    expect(storageObjectFromUrl(null, uid)).toBeNull()
  })
})

describe('isProfileBonusBlock', () => {
  it('accepts only the three blocks', () => {
    expect(isProfileBonusBlock('requisites')).toBe(true)
    expect(isProfileBonusBlock('bank')).toBe(true)
    expect(isProfileBonusBlock('signature')).toBe(true)
    expect(isProfileBonusBlock('logo')).toBe(false)
    expect(isProfileBonusBlock(undefined)).toBe(false)
  })
})
