// Pure helpers for the guided tour (src/components/DashboardTour.tsx).
//
// The tour used to filter its step list on every render, so anchors that
// mounted a moment later (the header wallet, the desktop nav row) made the
// counter jump "1 из 7" -> "2 из 8". The list is now resolved ONCE per run
// from whatever is rendered when the page has settled, and the counter reads
// from that frozen list.

export type AnchoredStep = { anchor: string }

/** Steps whose anchor is rendered right now, in their original order. */
export function resolveTourSteps<T extends AnchoredStep>(steps: readonly T[], isRendered: (anchor: string) => boolean): T[] {
  return steps.filter((s) => isRendered(s.anchor))
}

/** "N из M" numbering against the frozen list; 0 when the step is not in it. */
export function tourStepNumber<T extends AnchoredStep>(run: readonly T[], step: T | undefined): number {
  return step ? run.indexOf(step) + 1 : 0
}

/**
 * Waits for the set of rendered anchors to stop changing, then resolves the
 * steps. Polls every `intervalMs`; the list counts as settled once its length
 * is unchanged for `stableMs`, or at `maxMs` at the latest.
 */
export async function settleTourSteps<T extends AnchoredStep>(
  steps: readonly T[],
  isRendered: (anchor: string) => boolean,
  opts: { intervalMs?: number; stableMs?: number; maxMs?: number; cancelled?: () => boolean; sleep?: (ms: number) => Promise<void> } = {},
): Promise<T[]> {
  const { intervalMs = 100, stableMs = 400, maxMs = 3000, cancelled = () => false } = opts
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)))
  let last = resolveTourSteps(steps, isRendered)
  let stableFor = 0
  let waited = 0
  while (stableFor < stableMs && waited < maxMs) {
    await sleep(intervalMs)
    waited += intervalMs
    if (cancelled()) return last
    const now = resolveTourSteps(steps, isRendered)
    const same = now.length === last.length && now.every((s, k) => s === last[k])
    stableFor = same ? stableFor + intervalMs : 0
    last = now
  }
  return last
}
