// The spend ledger (Budget in the spec). RunPod's billing read is not available to this repo's key, and its records
// carry a pod id and no pod name, so the gate counts for itself. One repository variable per pod
// (`AX_CI_LEDGER_<label>`), written when the pod is made and closed by whoever removes it, so two runs never write the
// same variable. A fold adds closed pods to the month's total (`AX_CI_SPENT_<yyyy>_<mm>`); folds run in one job under
// one concurrency group, and each is safe to repeat or to cut short: the total remembers which labels it has taken.
import { CAP_USD, FALLBACK_COST_PER_HR, MAX_RUNNING, SWEEP_AGE_MIN } from './config.ts'
import { ok, type Call } from './http.ts'
import { ledgerVar, monthOf, spentVar } from './names.ts'

export type Entry = { label: string; podId?: string; costPerHr: number; start: number; end?: number }
export type Total = { usd: number; folded: string[] }
export type Var = { name: string; value: string }

export interface Vars {
  list(prefix: string): Promise<Var[]>
  get(name: string): Promise<string | null>
  set(name: string, value: string): Promise<void>
  remove(name: string): Promise<void>
}

const HOUR = 3_600_000
/** The most a pod can have cost: it never lives past the sweep's age, whatever the entry says. */
const MAX_LIFE_MS = SWEEP_AGE_MIN * 60_000
const FOLDED_KEPT = 300

export function costOf(e: Entry, nowMs: number): number {
  const end = Math.min(e.end ?? nowMs, e.start + MAX_LIFE_MS)
  return (Math.max(0, end - e.start) / HOUR) * e.costPerHr
}

function parseEntry(value: string): Entry | null {
  try {
    const e = JSON.parse(value) as Entry
    return typeof e.label === 'string' && Number.isFinite(e.start) && Number.isFinite(e.costPerHr) ? e : null
  } catch {
    return null
  }
}

function parseTotal(value: string | null): Total {
  if (!value) return { usd: 0, folded: [] }
  try {
    const t = JSON.parse(value) as Total
    return { usd: Number(t.usd) || 0, folded: Array.isArray(t.folded) ? t.folded : [] }
  } catch {
    return { usd: 0, folded: [] }
  }
}

export async function entries(vars: Vars): Promise<Entry[]> {
  return (await vars.list('AX_CI_LEDGER_')).map((v) => parseEntry(v.value)).filter((e): e is Entry => e !== null)
}

/** Written before the pod is made, at the dearest price, so a crash after the create still counts. */
export async function reserve(vars: Vars, label: string, nowMs: number): Promise<void> {
  const e: Entry = { label, costPerHr: FALLBACK_COST_PER_HR, start: nowMs }
  await vars.set(ledgerVar(label), JSON.stringify(e))
}

export async function priced(vars: Vars, label: string, podId: string, costPerHr: number): Promise<void> {
  const raw = await vars.get(ledgerVar(label))
  const e = raw ? parseEntry(raw) : null
  if (!e) return
  await vars.set(ledgerVar(label), JSON.stringify({ ...e, podId, costPerHr }))
}

/** The create failed: nothing ran, nothing is owed. */
export async function cancel(vars: Vars, label: string): Promise<void> {
  await vars.remove(ledgerVar(label))
}

/** Whoever removes a pod closes its entry. Closing twice keeps the first end time. */
export async function close(vars: Vars, label: string, nowMs: number): Promise<void> {
  const raw = await vars.get(ledgerVar(label))
  const e = raw ? parseEntry(raw) : null
  if (!e || e.end !== undefined) return
  await vars.set(ledgerVar(label), JSON.stringify({ ...e, end: nowMs }))
}

/**
 * An entry whose pod is gone from RunPod's list is closed now (the next `pod-start` or the sweep finds it). One that
 * has no pod id and is older than two minutes never got a pod. `keep` names labels whose pod is being made right now.
 */
export async function reconcile(vars: Vars, livePodNames: Set<string>, nowMs: number, keep: string[] = []): Promise<string[]> {
  const closed: string[] = []
  for (const e of await entries(vars)) {
    if (e.end !== undefined || keep.includes(e.label) || livePodNames.has(e.label)) continue
    if (e.podId === undefined && nowMs - e.start < 120_000) continue
    await close(vars, e.label, nowMs)
    closed.push(e.label)
  }
  return closed
}

/** Closed entries into the month's total, each once. Safe to run again or to stop midway. */
export async function fold(vars: Vars, nowMs: number): Promise<number> {
  let folded = 0
  for (const e of (await entries(vars)).filter((x) => x.end !== undefined)) {
    const { year, month } = monthOf(e.start)
    const name = spentVar(year, month)
    const total = parseTotal(await vars.get(name))
    if (!total.folded.includes(e.label)) {
      total.usd += costOf(e, nowMs)
      total.folded = [...total.folded, e.label].slice(-FOLDED_KEPT)
      await vars.set(name, JSON.stringify(total))
      folded++
    }
    await vars.remove(ledgerVar(e.label))
  }
  return folded
}

/** This month's spend: the total plus every entry not yet folded, an open one counted as running until now. */
export async function spent(vars: Vars, nowMs: number): Promise<number> {
  const { year, month } = monthOf(nowMs)
  const total = parseTotal(await vars.get(spentVar(year, month)))
  let usd = total.usd
  for (const e of await entries(vars)) {
    const m = monthOf(e.start)
    if (m.year !== year || m.month !== month || total.folded.includes(e.label)) continue
    usd += costOf(e, nowMs)
  }
  return usd
}

export type Verdict = { allowed: true } | { allowed: false; reason: string }

export function verdict(spentUsd: number, running: number, cap: number = CAP_USD, limit: number = MAX_RUNNING): Verdict {
  if (!(spentUsd < cap)) return { allowed: false, reason: `this month's GPU cap is reached: $${spentUsd.toFixed(2)} of $${cap}` }
  if (running >= limit) return { allowed: false, reason: `${running} ax-ci pods are already running (the limit is ${limit})` }
  return { allowed: true }
}

/** GitHub's repository variables, as a `Vars`. */
export function githubVars(gh: Call, repo: string): Vars {
  const base = `/repos/${repo}/actions/variables`
  return {
    async list(prefix) {
      const out: Var[] = []
      for (let page = 1; ; page++) {
        const r = ok('GET variables', await gh<{ variables: Var[] }>('GET', `${base}?per_page=30&page=${page}`))
        out.push(...r.variables.filter((v) => v.name.startsWith(prefix)))
        if (r.variables.length < 30) return out
      }
    },
    async get(name) {
      const r = await gh<Var>('GET', `${base}/${name}`)
      if (r.status === 404) return null
      return ok('GET variable', r).value
    },
    async set(name, value) {
      const made = await gh('POST', base, { name, value })
      if (made.status === 409 || made.status === 422) ok('PATCH variable', await gh('PATCH', `${base}/${name}`, { name, value }))
      else ok('POST variable', made)
    },
    async remove(name) {
      const r = await gh('DELETE', `${base}/${name}`)
      if (r.status !== 404) ok('remove variable', r)
    },
  }
}
