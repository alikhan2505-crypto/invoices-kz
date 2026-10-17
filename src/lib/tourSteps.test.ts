import { describe, it, expect } from 'vitest'
import { resolveTourSteps, tourStepNumber, settleTourSteps } from './tourSteps'

const steps = [{ anchor: 'a' }, { anchor: 'b' }, { anchor: 'c' }, { anchor: 'd' }]

describe('resolveTourSteps', () => {
  it('keeps only rendered anchors, in order', () => {
    const r = resolveTourSteps(steps, (a) => a !== 'b')
    expect(r.map((s) => s.anchor)).toEqual(['a', 'c', 'd'])
  })
  it('returns an empty list when nothing is rendered', () => {
    expect(resolveTourSteps(steps, () => false)).toEqual([])
  })
})

describe('tourStepNumber', () => {
  it('numbers against the frozen list', () => {
    const run = resolveTourSteps(steps, (a) => a !== 'a')
    expect(tourStepNumber(run, steps[2])).toBe(2)
    expect(tourStepNumber(run, steps[0])).toBe(0)
    expect(tourStepNumber(run, undefined)).toBe(0)
  })
})

describe('settleTourSteps', () => {
  it('waits for late anchors so the total is stable', async () => {
    let t = 0
    const sleep = async (ms: number) => { t += ms }
    // anchor "d" mounts 250ms after the start
    const isRendered = (a: string) => a !== 'd' || t >= 250
    const run = await settleTourSteps(steps, isRendered, { sleep })
    expect(run.map((s) => s.anchor)).toEqual(['a', 'b', 'c', 'd'])
  })
  it('gives up at maxMs', async () => {
    let t = 0
    const sleep = async (ms: number) => { t += ms }
    // list keeps changing forever
    const isRendered = (a: string) => a === 'a' || (Math.floor(t / 100) % 2 === 0)
    const run = await settleTourSteps(steps, isRendered, { sleep, maxMs: 1000 })
    expect(t).toBeLessThanOrEqual(1000)
    expect(run.length).toBeGreaterThan(0)
  })
  it('stops when cancelled', async () => {
    const run = await settleTourSteps(steps, () => true, { sleep: async () => {}, cancelled: () => true })
    expect(run.length).toBe(4)
  })
})
