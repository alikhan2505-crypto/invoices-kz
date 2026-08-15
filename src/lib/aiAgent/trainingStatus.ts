export interface TrainingState {
  status: 'training' | 'active' | 'paused'
  trainingStartedAt: string
  trainingMessageCount: number
}

export const TRAINING_DAYS_THRESHOLD = 7
export const TRAINING_MESSAGE_THRESHOLD = 20

// Whichever comes first flips training -> active, per the design spec
// (docs/superpowers/specs/2026-08-15-ai-agent-design.md). Only ever true
// when currently 'training' -- an 'active' or manually 'paused' agent is
// untouched by this check.
export function shouldExitTraining(state: TrainingState, now: Date): boolean {
  if (state.status !== 'training') return false
  const daysElapsed = (now.getTime() - new Date(state.trainingStartedAt).getTime()) / (1000 * 60 * 60 * 24)
  return daysElapsed >= TRAINING_DAYS_THRESHOLD || state.trainingMessageCount >= TRAINING_MESSAGE_THRESHOLD
}
