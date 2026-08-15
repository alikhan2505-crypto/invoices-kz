import { describe, it, expect } from 'vitest'
import { shouldExitTraining, TRAINING_DAYS_THRESHOLD, TRAINING_MESSAGE_THRESHOLD } from './trainingStatus'

describe('shouldExitTraining', () => {
  const now = new Date('2026-08-15T12:00:00.000Z')

  it('is false when neither threshold is met', () => {
    expect(shouldExitTraining({ status: 'training', trainingStartedAt: '2026-08-14T12:00:00.000Z', trainingMessageCount: 3 }, now)).toBe(false)
  })

  it('is true once the day threshold is reached', () => {
    const startedAt = new Date(now.getTime() - TRAINING_DAYS_THRESHOLD * 24 * 60 * 60 * 1000).toISOString()
    expect(shouldExitTraining({ status: 'training', trainingStartedAt: startedAt, trainingMessageCount: 0 }, now)).toBe(true)
  })

  it('is true once the message-count threshold is reached, even before the day threshold', () => {
    expect(shouldExitTraining({ status: 'training', trainingStartedAt: '2026-08-15T11:00:00.000Z', trainingMessageCount: TRAINING_MESSAGE_THRESHOLD }, now)).toBe(true)
  })

  it('is false for an agent that is not currently in training', () => {
    const startedAt = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString()
    expect(shouldExitTraining({ status: 'active', trainingStartedAt: startedAt, trainingMessageCount: 999 }, now)).toBe(false)
    expect(shouldExitTraining({ status: 'paused', trainingStartedAt: startedAt, trainingMessageCount: 999 }, now)).toBe(false)
  })
})
