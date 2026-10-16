import { describe, it, expect } from 'vitest'
import { shouldExitTraining, trainingCountAfterReview, agentRowShouldExitTraining, trainingDaysLeft, trainingDayClockMayHaveRun, TRAINING_DAYS_THRESHOLD, TRAINING_MESSAGE_THRESHOLD } from './trainingStatus'

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

describe('trainingCountAfterReview', () => {
  it('counts an approved (sent) draft', () => {
    expect(trainingCountAfterReview('send', 3)).toBe(4)
  })

  it('does not count a skipped draft', () => {
    expect(trainingCountAfterReview('skip', 3)).toBe(3)
  })

  it('treats a missing/negative count as zero', () => {
    expect(trainingCountAfterReview('send', NaN)).toBe(1)
    expect(trainingCountAfterReview('skip', -2)).toBe(0)
  })
})

describe('agentRowShouldExitTraining (days counted from the first review draft)', () => {
  const now = new Date('2026-10-15T12:00:00.000Z')
  const daysAgo = (d: number) => new Date(now.getTime() - d * 24 * 60 * 60 * 1000).toISOString()

  it('exits once a week has passed since the first draft, with zero approvals', () => {
    // The real case from the 15.10.2026 audit: 49 days in training, count 1 --
    // but now only because its first draft went to review that long ago.
    expect(agentRowShouldExitTraining({ status: 'training', training_started_at: daysAgo(49), training_message_count: 1 }, now, daysAgo(40))).toBe(true)
    expect(agentRowShouldExitTraining({ status: 'training', training_started_at: daysAgo(30), training_message_count: 0 }, now, daysAgo(TRAINING_DAYS_THRESHOLD))).toBe(true)
  })

  it('never fires the day threshold for an agent that has had no drafts at all', () => {
    // Created 30 days ago, no channel, nobody ever wrote -- must stay in training.
    expect(agentRowShouldExitTraining({ status: 'training', training_started_at: daysAgo(30), training_message_count: 0 }, now, null)).toBe(false)
    expect(agentRowShouldExitTraining({ status: 'training', training_started_at: null, training_message_count: null }, now, null)).toBe(false)
  })

  it('does not count the days between creation and the first draft', () => {
    expect(agentRowShouldExitTraining({ status: 'training', training_started_at: daysAgo(30), training_message_count: 2 }, now, daysAgo(2))).toBe(false)
  })

  it('exits on the approval threshold even with no draft date and before the day threshold', () => {
    expect(agentRowShouldExitTraining({ status: 'training', training_started_at: daysAgo(1), training_message_count: TRAINING_MESSAGE_THRESHOLD }, now, daysAgo(1))).toBe(true)
    expect(agentRowShouldExitTraining({ status: 'training', training_started_at: null, training_message_count: TRAINING_MESSAGE_THRESHOLD }, now, null)).toBe(true)
  })

  it('never touches an active or paused agent', () => {
    expect(agentRowShouldExitTraining({ status: 'active', training_started_at: daysAgo(30), training_message_count: 0 }, now, daysAgo(30))).toBe(false)
    expect(agentRowShouldExitTraining({ status: 'paused', training_started_at: daysAgo(30), training_message_count: 99 }, now, daysAgo(30))).toBe(false)
  })
})

describe('trainingDaysLeft', () => {
  const now = new Date('2026-10-15T12:00:00.000Z')
  const daysAgo = (d: number) => new Date(now.getTime() - d * 24 * 60 * 60 * 1000).toISOString()

  it('is null until the first draft exists', () => {
    expect(trainingDaysLeft(null, now)).toBeNull()
    expect(trainingDaysLeft('not-a-date', now)).toBeNull()
  })

  it('counts down from the first draft and floors at zero', () => {
    expect(trainingDaysLeft(daysAgo(0), now)).toBe(TRAINING_DAYS_THRESHOLD)
    expect(trainingDaysLeft(daysAgo(2.5), now)).toBe(5)
    expect(trainingDaysLeft(daysAgo(40), now)).toBe(0)
  })
})

describe('trainingDayClockMayHaveRun', () => {
  const now = new Date('2026-10-15T12:00:00.000Z')
  const daysAgo = (d: number) => new Date(now.getTime() - d * 24 * 60 * 60 * 1000).toISOString()

  it('skips the first-draft lookup while the agent itself is younger than the threshold', () => {
    expect(trainingDayClockMayHaveRun({ status: 'training', training_started_at: daysAgo(3), training_message_count: 0 }, now)).toBe(false)
    expect(trainingDayClockMayHaveRun({ status: 'training', training_started_at: daysAgo(TRAINING_DAYS_THRESHOLD), training_message_count: 0 }, now)).toBe(true)
    expect(trainingDayClockMayHaveRun({ status: 'training', training_started_at: null, training_message_count: 0 }, now)).toBe(true)
  })
})
