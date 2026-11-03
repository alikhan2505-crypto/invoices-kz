import { describe, it, expect, vi } from 'vitest'
import { hasReplayableTour, registerTourStarter, replayTour, subscribeReplayableTour } from './tourReplay'

describe('реестр запускалок тура', () => {
  it('нет тура - нечего показывать; зарегистрировали - можно; сняли - снова нечего', () => {
    expect(hasReplayableTour()).toBe(false)
    expect(replayTour()).toBe(false)
    const start = vi.fn()
    const off = registerTourStarter(start)
    expect(hasReplayableTour()).toBe(true)
    expect(replayTour()).toBe(true)
    expect(start).toHaveBeenCalledTimes(1)
    off()
    expect(hasReplayableTour()).toBe(false)
    expect(replayTour()).toBe(false)
  })

  it('два тура на странице: запускается последний, после его снятия - предыдущий', () => {
    const a = vi.fn(); const b = vi.fn()
    const offA = registerTourStarter(a)
    const offB = registerTourStarter(b)
    replayTour()
    expect(b).toHaveBeenCalledTimes(1)
    expect(a).not.toHaveBeenCalled()
    offB()
    replayTour()
    expect(a).toHaveBeenCalledTimes(1)
    offA()
  })

  it('подписчик узнаёт о появлении и пропаже тура; отписка работает', () => {
    const listener = vi.fn()
    const unsubscribe = subscribeReplayableTour(listener)
    const off = registerTourStarter(() => {})
    expect(listener).toHaveBeenCalledTimes(1)
    off()
    expect(listener).toHaveBeenCalledTimes(2)
    unsubscribe()
    registerTourStarter(() => {})()
    expect(listener).toHaveBeenCalledTimes(2)
  })

  it('двойное снятие одной запускалки безвредно', () => {
    const off = registerTourStarter(() => {})
    off()
    expect(() => off()).not.toThrow()
    expect(hasReplayableTour()).toBe(false)
  })
})
