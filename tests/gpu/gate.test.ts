import { describe, test } from 'node:test'
import { reserve, priced, spent, entries, fold } from '../../scripts/gpu/budget.ts'
import { CAP_USD, GPU_ORDER, ONLINE_WAIT_MS, WATCH_GRACE_MS } from '../../scripts/gpu/config.ts'
import { ensureOnline, guard, makePod, podAgeMs, stopRun, sweepAll, watchRun, watchState } from '../../scripts/gpu/gate.ts'
import { makeLabel, replacementName } from '../../scripts/gpu/names.ts'
import { render, summaryLines } from '../../scripts/gpu/summary.ts'
import { expect } from '../expect.ts'
import { deps } from './fakes.ts'

const MIN = 60_000
const labelAt = (clock: number, run = '100', random = 'ab12cd') => makeLabel(run, '1', clock, random)

describe('making a pod', () => {
  test('asks for secure cloud and one NVIDIA card, with no port and no ssh key', async () => {
    const { d, w } = deps()
    const label = labelAt(w.clock)
    const made = await makePod(d, { podName: label, label, jit: 'jit-secret', runId: '100' })
    expect(made.gpu).toBe(GPU_ORDER[0])
    const body = w.created[0].body
    expect(body.cloud).toBe('SECURE')
    expect(body.gpu).toEqual({ id: GPU_ORDER[0], count: 1 })
    expect(body.ports).toBeUndefined()
    expect(body.startSsh).toBeUndefined()
    expect(body.env.JIT_CONFIG).toBe('jit-secret')
    expect(body.env.NVIDIA_DRIVER_CAPABILITIES).toBe('all')
    expect(body.env.AX_RUN_ID).toBe('100')
    expect(body.name).toBe(label)
  })
  test('a card with no stock falls to the next, and the summary says so (a forced fall-back)', async () => {
    const { d, w, retries, events } = deps()
    w.stock.delete(GPU_ORDER[0])
    w.stock.delete(GPU_ORDER[1])
    const label = labelAt(w.clock)
    const made = await makePod(d, { podName: label, label, jit: 'j', runId: '100' })
    expect(made.gpu).toBe(GPU_ORDER[2])
    const lines = summaryLines({ gpu: made.gpu, cloud: 'SECURE', costPerHr: made.costPerHr, priced: made.priced, podId: made.pod.id, label }, events, retries)
    expect(lines.filter((l) => l.startsWith('Fell back'))).toHaveLength(2)
    expect(lines[0]).toContain(GPU_ORDER[2])
    expect(lines[0]).toContain('secure cloud')
    const out = render(lines)
    expect(out.annotations.some((a) => a.startsWith('::warning::Fell back'))).toBe(true)
  })
  test('with no stock at all it fails, leaves no ledger entry and no runner', async () => {
    const { d, w } = deps()
    w.stock.clear()
    const label = labelAt(w.clock)
    await d.gh('POST', `/repos/${d.repo}/actions/runners/generate-jitconfig`, { name: label, labels: [label], runner_group_id: 1 })
    let failed = ''
    await makePod(d, { podName: label, label, jit: 'j', runId: '100' }).catch((e: Error) => (failed = e.message))
    expect(failed).toContain('no pod could be made')
    expect(await entries(d.vars)).toHaveLength(0)
    expect(w.runners).toHaveLength(0)
  })
  test('a refused key stops at once: no other card helps', async () => {
    const { d, w } = deps()
    w.createStatus = 403
    const label = labelAt(w.clock)
    await makePod(d, { podName: label, label, jit: 'j', runId: '100' }).catch(() => undefined)
    expect(w.requests.filter((r) => r === 'POST api.runpod.io/v2/pods')).toHaveLength(1)
  })
  test('the create body is never in an error message', async () => {
    const { d, w } = deps()
    w.stock.clear()
    const label = labelAt(w.clock)
    let msg = ''
    await makePod(d, { podName: label, label, jit: 'super-secret-jit', runId: '100' }).catch((e: Error) => (msg = e.message))
    expect(msg).not.toContain('super-secret-jit')
  })
  test('a retried call is counted in the summary', async () => {
    const { d, retries } = deps()
    let first = true
    const rp = d.rp
    d.rp = async (m, p, b) => {
      if (first && m === 'GET') {
        first = false
        retries.set('GET /v2/pods', 1)
      }
      return rp(m, p, b)
    }
    await d.rp('GET', '/v2/pods')
    expect(summaryLines(null, [], retries)).toContain('Retried 1 time: GET /v2/pods')
  })
})

describe('the guard at the start of pod-start', () => {
  test('refuses at 3 ax-ci pods running, and counts no other pod', async () => {
    const { d, w } = deps()
    for (const n of ['a', 'b', 'c']) w.pods.push({ id: n, name: labelAt(w.clock, '1', `ab12c${n}`), cost: 1, createdAt: new Date(w.clock).toISOString(), gpu: 'x' })
    w.pods.push({ id: 'z', name: 'ae-ci-5-1-x', cost: 1, createdAt: new Date(w.clock).toISOString(), gpu: 'x' })
    w.pods.push({ id: 'y', name: 'someone-elses-pod', cost: 1, createdAt: new Date(w.clock).toISOString(), gpu: 'x' })
    const g = await guard(d)
    expect(g.running).toBe(3)
    expect(g.verdict.allowed).toBe(false)
    w.pods.shift()
    expect((await guard(d)).verdict.allowed).toBe(true)
  })
  test('refuses at the cap and passes just under it', async () => {
    const { d, w } = deps()
    await reserve(d.vars, labelAt(w.clock), w.clock - 100 * MIN)
    await priced(d.vars, labelAt(w.clock), 'p', 1)
    // The entry has no pod listed, so it is closed at once; 35 minutes at $1 an hour is the most it can have cost.
    expect((await guard(d)).verdict.allowed).toBe(true)
    await fold(d.vars, w.clock)
    await d.vars.set('AX_CI_SPENT_2026_11', JSON.stringify({ usd: CAP_USD - 0.01, folded: [] }))
    expect((await guard(d)).verdict.allowed).toBe(true)
    await d.vars.set('AX_CI_SPENT_2026_11', JSON.stringify({ usd: CAP_USD, folded: [] }))
    expect((await guard(d)).verdict.allowed).toBe(false)
  })
  test('sweeps ax-ci pods older than 35 minutes and nothing else', async () => {
    const { d, w } = deps()
    const old = w.clock - 36 * MIN
    const young = w.clock - 34 * MIN
    w.pods.push({ id: 'old', name: labelAt(old, '1'), cost: 1, createdAt: new Date(old).toISOString(), gpu: 'x' })
    w.pods.push({ id: 'young', name: labelAt(young, '2'), cost: 1, createdAt: new Date(young).toISOString(), gpu: 'x' })
    w.pods.push({ id: 'ae', name: 'ae-ci-1-1-abcdefgh', cost: 1, createdAt: new Date(old).toISOString(), gpu: 'x' })
    w.pods.push({ id: 'other', name: 'long-running-pod', cost: 1, createdAt: new Date(old - 99 * 60 * MIN).toISOString(), gpu: 'x' })
    const swept = (await guard(d)).swept
    expect(swept).toHaveLength(1)
    expect(w.pods.map((p) => p.id).sort()).toEqual(['ae', 'other', 'young'])
  })
  test('the pod age comes from its name, so it is known before RunPod has a runtime', () => {
    expect(podAgeMs({ id: '1', name: labelAt(1_000_000_000_000) }, 1_000_000_000_000 + 7 * MIN)).toBe(7 * MIN)
    expect(podAgeMs({ id: '1', name: 'ax-ci-1' }, 5)).toBe(Number.POSITIVE_INFINITY)
  })
})

describe('waiting for the runner', () => {
  test('a pod whose runner comes online is kept as it is', async () => {
    const { d, w } = deps()
    const label = labelAt(w.clock)
    const made = await makePod(d, { podName: label, label, jit: 'j', runId: '100' })
    const r = await ensureOnline(d, { label, podName: label, podId: made.pod.id, gpu: made.gpu, runId: '100' })
    expect(r.podName).toBe(label)
    expect(d.events).toHaveLength(0)
  })
  test('a pod with no runner online after 5 minutes is deleted and replaced once, on the next card, with the same label', async () => {
    const { d, w } = deps()
    const label = labelAt(w.clock)
    w.autoOnline = false
    const first = await makePod(d, { podName: label, label, jit: 'j', runId: '100' })
    // The replacement's runner comes online as it is made.
    const origFetch = w.autoOnline
    w.autoOnline = true
    const r = await (async () => {
      const t0 = w.clock
      const p = ensureOnline(d, { label, podName: label, podId: first.pod.id, gpu: first.gpu, runId: '100' })
      const out = await p
      expect(w.clock - t0 >= ONLINE_WAIT_MS).toBe(true)
      return out
    })()
    void origFetch
    expect(r.podName).toBe(replacementName(label))
    expect(r.gpu).toBe(GPU_ORDER[1])
    expect(w.pods.map((p) => p.name)).toEqual([replacementName(label)])
    expect(d.events.some((e) => e.kind === 'replaced' && e.text.includes(label))).toBe(true)
    // The job asks for the first label; the replacement's runner carries it.
    const runner = w.runners.find((x) => x.name === replacementName(label))
    expect(runner?.labels.some((l) => l.name === label)).toBe(true)
  })
  test('a second miss fails naming both pods and leaves nothing running', async () => {
    const { d, w } = deps()
    w.autoOnline = false
    const label = labelAt(w.clock)
    const first = await makePod(d, { podName: label, label, jit: 'j', runId: '100' })
    let msg = ''
    await ensureOnline(d, { label, podName: label, podId: first.pod.id, gpu: first.gpu, runId: '100' }).catch((e: Error) => (msg = e.message))
    expect(msg).toContain(label)
    expect(msg).toContain(replacementName(label))
    expect(w.pods).toHaveLength(0)
  })
})

describe('pod-stop', () => {
  test('deletes every pod of the run attempt by name, with no id from pod-start, and none of another run', async () => {
    const { d, w } = deps()
    const mine = labelAt(w.clock, '555')
    const other = labelAt(w.clock, '556')
    await makePod(d, { podName: mine, label: mine, jit: 'j', runId: '555' })
    await makePod(d, { podName: replacementName(mine), label: mine, jit: 'j', runId: '555' })
    await makePod(d, { podName: other, label: other, jit: 'j', runId: '556' })
    const r = await stopRun(d, '555', '1')
    expect(r.removed).toHaveLength(2)
    expect(w.pods.map((p) => p.name)).toEqual([other])
    expect(w.runners.some((x) => x.name === mine)).toBe(false)
  })
  test('closes the ledger entry even when the pod was never listed', async () => {
    const { d, w } = deps()
    await reserve(d.vars, labelAt(w.clock, '777'), w.clock)
    await stopRun(d, '777', '1')
    expect((await entries(d.vars))[0].end).toBe(w.clock)
  })
  test('fails loudly when a pod is left', async () => {
    const { d, w } = deps()
    const mine = labelAt(w.clock, '888')
    const made = await makePod(d, { podName: mine, label: mine, jit: 'j', runId: '888' })
    w.refuseDelete.add(made.pod.id)
    let msg = ''
    await stopRun(d, '888', '1').catch((e: Error) => (msg = e.message))
    expect(msg).toContain('a pod is left')
    expect(msg).toContain(mine)
  })
  test('a run cancelled during pod-start: the label alone finds the pod', async () => {
    const { d, w } = deps()
    const mine = labelAt(w.clock, '999')
    await makePod(d, { podName: mine, label: mine, jit: 'j', runId: '999' })
    await stopRun(d, '999', '1')
    expect(w.pods).toHaveLength(0)
  })
})

describe('the sweep', () => {
  test('removes old ax-ci pods, closes entries of vanished pods, touches no other name', async () => {
    const { d, w } = deps()
    const old = labelAt(w.clock - 40 * MIN, '1')
    await reserve(d.vars, old, w.clock - 40 * MIN)
    await priced(d.vars, old, 'o1', 1)
    w.pods.push({ id: 'o1', name: old, cost: 1, createdAt: new Date(w.clock - 40 * MIN).toISOString(), gpu: 'x' })
    w.pods.push({ id: 'ae', name: 'ae-ci-1-1-xxxxxxxx', cost: 1, createdAt: new Date(w.clock - 99 * MIN).toISOString(), gpu: 'x' })
    const gone = labelAt(w.clock - 10 * MIN, '2')
    await reserve(d.vars, gone, w.clock - 10 * MIN)
    await priced(d.vars, gone, 'g1', 1)
    const r = await sweepAll(d)
    expect(r.removed).toEqual([old])
    expect(r.closed).toEqual([gone])
    expect(w.pods.map((p) => p.id)).toEqual(['ae'])
    expect((await spent(d.vars, w.clock)) < 1).toBe(true)
  })
})

describe('watch', () => {
  test('the grace is 3 minutes', () => {
    expect(WATCH_GRACE_MS).toBe(180_000)
    expect(watchState([{ name: 'gpu-smoke', status: 'queued' }], WATCH_GRACE_MS)).toBe('wait')
    expect(watchState([{ name: 'gpu-smoke', status: 'queued' }], WATCH_GRACE_MS + 1)).toBe('stuck')
    expect(watchState([], WATCH_GRACE_MS + 1)).toBe('stuck')
  })
  test('gpu-smoke running or finished is a start', () => {
    expect(watchState([{ name: 'gpu-smoke', status: 'in_progress' }], 1e9)).toBe('started')
    expect(watchState([{ name: 'gpu-smoke', status: 'completed' }], 1e9)).toBe('started')
  })
  test('cancels the run with the reason when our runner was taken by another job', async () => {
    const { d, w } = deps()
    w.jobs = [{ name: 'gpu-smoke', status: 'queued', conclusion: null }]
    const said: string[] = []
    const state = await watchRun(d, '4242', '1', (l) => said.push(l))
    expect(state).toBe('stuck')
    expect(w.cancelled).toEqual(['4242'])
    expect(said[0]).toContain('taken by another job')
    expect(w.clock - Date.parse('2026-11-27T12:00:00Z') >= WATCH_GRACE_MS).toBe(true)
  })
  test('does not cancel a run whose gpu-smoke starts', async () => {
    const { d, w } = deps()
    w.jobs = [{ name: 'gpu-smoke', status: 'queued', conclusion: null }]
    let polls = 0
    const sleep = d.sleep
    d.sleep = async (ms) => {
      await sleep(ms)
      if (++polls === 3) w.jobs = [{ name: 'gpu-smoke', status: 'in_progress', conclusion: null }]
    }
    expect(await watchRun(d, '1', '1', () => undefined)).toBe('started')
    expect(w.cancelled).toHaveLength(0)
  })
})
