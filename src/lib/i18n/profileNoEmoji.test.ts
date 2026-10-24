import { describe, it, expect } from 'vitest'
import { profileCoreDict } from './profileCore'
import { profileContentDict } from './profileContent'
import { profileAccountsDict } from './profileAccounts'
import { proGateCtaDict } from './proGate'

// Эмодзи как значки интерфейса в строках профиля убраны (24.10.2026): цветной
// маркер рисуется CSS-точкой, значок это SVG. Текстовые стрелки и галочка (U+2713) не считаются эмодзи.
const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{26FF}\u{2705}\u{2728}\u{274C}\u{274E}\u{2753}-\u{2757}\u{2795}-\u{2797}\u{FE0F}]/u

function collect(v: unknown, path: string, out: string[]) {
  if (typeof v === 'string') { if (EMOJI.test(v)) out.push(`${path}: ${v}`) }
  else if (Array.isArray(v)) v.forEach((x, i) => collect(x, `${path}[${i}]`, out))
  else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) collect(x, `${path}.${k}`, out)
}

describe('профиль: нет эмодзи в строках интерфейса', () => {
  for (const [name, dict] of Object.entries({ profileCoreDict, profileContentDict, profileAccountsDict, proGateCtaDict })) {
    it(name, () => {
      const found: string[] = []
      collect(dict, name, found)
      expect(found).toEqual([])
    })
  }
})
