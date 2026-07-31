// In-progress Kaspi Cashier pairing attempts, keyed by processId. A
// serverless function instance is not guaranteed to survive between the
// init and verify calls, so this is a best-effort in-memory cache — if it's
// cold on verify, the user must restart the connect flow. Acceptable: this
// is a one-time setup action, not a hot path.
//
// Route handler modules in this Next.js version may only export the
// HTTP-method handlers and a small set of framework-recognized config
// exports — an arbitrary extra export (like a shared Map) isn't a supported
// pattern there, so this in-progress pairing state lives in its own plain
// module instead, imported by both the init and verify routes.
import { Identity } from './crypto'

interface PendingAttempt {
  identity: Identity
  userToken: string | null
  userId: string
  phoneNumber: string
}

const pending = new Map<string, PendingAttempt>()

export function setPendingAttempt(processId: string, attempt: PendingAttempt) {
  pending.set(processId, attempt)
}

export function getPendingAttempt(processId: string): PendingAttempt | undefined {
  return pending.get(processId)
}

export function deletePendingAttempt(processId: string) {
  pending.delete(processId)
}
