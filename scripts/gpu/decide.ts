// The two decisions that need no network: does the GPU check apply to this change (and is it a fork's), and did the
// run pass. Pure functions, so tests can pin every case.

export type PlanInput = {
  event: string
  actor: string
  repo: string
  /** `pull_request.head.repo.full_name`, or for a merge-queue run the head repo of the queued pull request. */
  headRepo: string | null
  /** Files the pull request changes (pull requests only). Null when GitHub could not give the list. */
  files: string[] | null
}

export type Plan = {
  /** The GPU check applies: every pod job runs. */
  apply: boolean
  /** The change is from a fork: no pod job runs and `gpu` fails. */
  fork: boolean
  /** `gpu` passes without a pod (docs only, or a Dependabot pull request that runs in the queue). */
  passes: boolean
  why: string
}

/** The pull request number in a merge-queue branch (`gh-readonly-queue/main/pr-<n>-<sha>`), or null. */
export function queuePr(ref: string): number | null {
  const m = /^(?:refs\/heads\/)?gh-readonly-queue\/[^/]+\/pr-(\d+)-[0-9a-f]+$/.exec(ref)
  return m ? Number(m[1]) : null
}

const DOCS = /^(CLAUDE\.md|docs\/.+\.md)$/

export function plan(i: PlanInput): Plan {
  const sameRepo = i.headRepo !== null && i.headRepo.toLowerCase() === i.repo.toLowerCase()
  if (i.event === 'pull_request' || i.event === 'merge_group') {
    // A head repo we cannot read is treated as a fork: no pod for what we cannot vouch for.
    if (!sameRepo) {
      return { apply: false, fork: true, passes: false, why: `this change is from ${i.headRepo ?? 'a repo that could not be read'}, not ${i.repo}` }
    }
  }
  if (i.event === 'pull_request' && i.actor === 'dependabot[bot]') {
    return { apply: false, fork: false, passes: true, why: 'runs in the queue' }
  }
  if (i.event === 'pull_request' && i.files && i.files.length > 0 && i.files.every((f) => DOCS.test(f))) {
    return { apply: false, fork: false, passes: true, why: 'not applicable: only Markdown people read changed' }
  }
  return { apply: true, fork: false, passes: false, why: 'the GPU check applies' }
}

export type Results = Record<'plan' | 'podStart' | 'gpuSmoke' | 'watch' | 'podStop', string>

/**
 * The aggregate. It passes only when every job that applies ended `success`; a cancelled job, or one skipped because
 * something before it failed, fails it (Y-a), so a run `watch` cancels fails the check instead of passing it.
 */
export function judge(p: Plan, r: Results): { pass: boolean; why: string } {
  if (r.plan !== 'success') return { pass: false, why: `plan ended ${r.plan}` }
  if (p.fork) return { pass: false, why: `a fork's change gets no pod (${p.why})` }
  if (p.passes) return { pass: true, why: p.why }
  const bad = (Object.entries(r) as [string, string][]).filter(([, result]) => result !== 'success')
  if (bad.length) return { pass: false, why: bad.map(([job, result]) => `${job} ${result}`).join(', ') }
  return { pass: true, why: 'every job passed' }
}
