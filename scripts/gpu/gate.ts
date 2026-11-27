// The gate's logic: what `pod-start`, `pod-stop`, the sweep and `watch` do, with every outside call passed in so tests
// run them against stand-in APIs. The CLI files in `cli/` only read the environment and call these.
import { cancel, close, entries, priced, reconcile, reserve, spent, verdict, type Vars, type Verdict } from './budget.ts'
import { GPU_ORDER, IDLE_LIMIT_MIN, JOB_LIMIT_MIN, ONLINE_WAIT_MS, SWEEP_AGE_MIN, WATCH_GRACE_MS } from './config.ts'
import { deleteRunner, makeJit, runJobs, runnerOnline, cancelRun } from './github.ts'
import type { Call } from './http.ts'
import { isOurs, labelTime, ledgerVar, podPrefix, replacementName } from './names.ts'
import { allPods, createPod, deletePod, type Event, type Made, type Pod } from './runpod.ts'

export type Deps = {
  rp: Call
  gh: Call
  vars: Vars
  repo: string
  image: string
  now: () => number
  sleep: (ms: number) => Promise<void>
  events: Event[]
}

/** How old a pod is: from the time in its name, else from RunPod's `createdAt`; a pod with neither is treated as old. */
export function podAgeMs(pod: Pod, nowMs: number): number {
  const t = labelTime(pod.name) ?? (pod.createdAt ? Date.parse(pod.createdAt) : NaN)
  return Number.isFinite(t) ? nowMs - (t as number) : Number.POSITIVE_INFINITY
}

/** Removes one pod: the pod, its runner, and its ledger entry. A refused delete leaves the ledger open for the next sweep. */
export async function removePod(d: Deps, pod: { id?: string; name: string }): Promise<boolean> {
  const gone = pod.id === undefined ? true : await deletePod(d.rp, pod.id)
  await deleteRunner(d.gh, d.repo, pod.name).catch(() => undefined)
  if (gone) await close(d.vars, pod.name, d.now())
  return gone
}

/** Deletes `ax-ci-*` pods older than the sweep age. Never touches any other name. */
export async function sweepOld(d: Deps, pods: Pod[]): Promise<string[]> {
  const removed: string[] = []
  for (const pod of pods.filter((p) => isOurs(p.name))) {
    if (podAgeMs(pod, d.now()) > SWEEP_AGE_MIN * 60_000 && (await removePod(d, pod))) removed.push(pod.name)
  }
  return removed
}

/** The start of every `pod-start`: sweep, settle the ledger, then say whether a pod may be made. */
export async function guard(d: Deps): Promise<{ verdict: Verdict; swept: string[]; spent: number; running: number }> {
  const ours = (await allPods(d.rp)).filter((p) => isOurs(p.name))
  const swept = await sweepOld(d, ours)
  const alive = ours.filter((p) => !swept.includes(p.name))
  await reconcile(d.vars, new Set(alive.map((p) => p.name)), d.now())
  const usd = await spent(d.vars, d.now())
  return { verdict: verdict(usd, alive.length), swept, spent: usd, running: alive.length }
}

/** Makes one pod and its ledger entry. A refused create leaves nothing behind: no entry, and the runner is deleted. */
export async function makePod(
  d: Deps,
  o: { podName: string; label: string; jit: string; runId: string; skip?: string[] },
): Promise<Made> {
  await reserve(d.vars, o.podName, d.now())
  try {
    const made = await createPod(
      d.rp,
      {
        name: o.podName,
        image: d.image,
        diskGb: 40,
        env: {
          JIT_CONFIG: o.jit,
          AX_RUN_ID: o.runId,
          AX_REPO: d.repo,
          NVIDIA_DRIVER_CAPABILITIES: 'all',
          AX_IDLE_LIMIT_MIN: String(IDLE_LIMIT_MIN),
          AX_JOB_LIMIT_MIN: String(JOB_LIMIT_MIN),
        },
      },
      d.events,
      GPU_ORDER.filter((g) => !(o.skip ?? []).includes(g)),
    )
    await priced(d.vars, o.podName, made.pod.id, made.costPerHr)
    return made
  } catch (err) {
    await cancel(d.vars, o.podName)
    await deleteRunner(d.gh, d.repo, o.podName).catch(() => undefined)
    throw err
  }
}

export async function waitOnline(d: Deps, name: string, limitMs: number = ONLINE_WAIT_MS, everyMs = 10_000): Promise<boolean> {
  const until = d.now() + limitMs
  for (;;) {
    if (await runnerOnline(d.gh, d.repo, name)) return true
    if (d.now() >= until) return false
    await d.sleep(everyMs)
  }
}

/**
 * Waits for the pod's runner. A pod that does not come online is deleted and replaced once, on the next card in the
 * list and with the same runner label (the job finds it by that label); a second miss fails naming both pods.
 */
export async function ensureOnline(
  d: Deps,
  o: { label: string; podName: string; podId: string; gpu: string; runId: string },
): Promise<{ podName: string; podId: string; gpu: string }> {
  if (await waitOnline(d, o.podName)) return o
  const second = replacementName(o.label)
  d.events.push({ kind: 'replaced', text: `${o.podName} (${o.gpu}) had no runner online after ${ONLINE_WAIT_MS / 60_000} minutes; replaced by ${second}` })
  await removePod(d, { id: o.podId, name: o.podName })
  const { jit } = await makeJit(d.gh, d.repo, second, o.label)
  let made: Made
  try {
    made = await makePod(d, { podName: second, label: o.label, jit, runId: o.runId, skip: [o.gpu] })
  } catch (err) {
    throw new Error(`no runner came online on ${o.podName}, and ${second} could not be made: ${(err as Error).message}`)
  }
  if (await waitOnline(d, second)) return { podName: second, podId: made.pod.id, gpu: made.gpu }
  await removePod(d, { id: made.pod.id, name: second })
  throw new Error(`no runner came online on either pod: ${o.podName} and ${second}`)
}

/** The end of a run: every pod named for it goes, whether or not `pod-start` told us its id. Fails loudly if one is left. */
export async function stopRun(d: Deps, runId: string, attempt: string): Promise<{ removed: string[] }> {
  const prefix = podPrefix(runId, attempt)
  const removed: string[] = []
  const mine = (await allPods(d.rp)).filter((p) => p.name.startsWith(prefix))
  for (const pod of mine) {
    if (await removePod(d, pod)) removed.push(pod.name)
  }
  // An entry whose pod was never listed (the create was cut off) is closed too.
  const prefixVar = ledgerVar(prefix)
  for (const e of await entries(d.vars)) {
    if (ledgerVar(e.label).startsWith(prefixVar)) await close(d.vars, e.label, d.now())
  }
  const left = (await allPods(d.rp)).filter((p) => p.name.startsWith(prefix))
  if (left.length) throw new Error(`a pod is left after the run: ${left.map((p) => `${p.name} (${p.id})`).join(', ')}`)
  return { removed }
}

/** The scheduled sweep: old pods go, entries for vanished pods close. Returns what it did. */
export async function sweepAll(d: Deps): Promise<{ removed: string[]; closed: string[] }> {
  const ours = (await allPods(d.rp)).filter((p) => isOurs(p.name))
  const removed = await sweepOld(d, ours)
  const alive = ours.filter((p) => !removed.includes(p.name))
  const closed = await reconcile(d.vars, new Set(alive.map((p) => p.name)), d.now())
  return { removed, closed }
}

export type WatchState = 'wait' | 'started' | 'stuck'

/** `gpu-smoke` is started once GitHub shows it running or finished; it is stuck when it is still not after the grace. */
export function watchState(jobs: { name: string; status: string }[], sinceMs: number): WatchState {
  const smoke = jobs.find((j) => j.name === 'gpu-smoke' || j.name.startsWith('gpu-smoke '))
  if (smoke && (smoke.status === 'in_progress' || smoke.status === 'completed')) return 'started'
  return sinceMs > WATCH_GRACE_MS ? 'stuck' : 'wait'
}

export async function watchRun(
  d: Deps,
  runId: string,
  attempt: string,
  say: (line: string) => void,
  everyMs = 10_000,
): Promise<WatchState> {
  const start = d.now()
  for (;;) {
    const state = watchState(await runJobs(d.gh, d.repo, runId, attempt), d.now() - start)
    if (state === 'started') return state
    if (state === 'stuck') {
      say('Our runner was taken by another job, or never started `gpu-smoke`: cancelling this run so the pod is deleted and the check fails.')
      await cancelRun(d.gh, d.repo, runId)
      return state
    }
    await d.sleep(everyMs)
  }
}
