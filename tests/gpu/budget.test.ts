import { describe, expect, test } from 'bun:test'
import { cancel, close, costOf, entries, fold, priced, reconcile, reserve, spent, verdict } from '../../scripts/gpu/budget.ts'
import { CAP_USD, MAX_RUNNING, SWEEP_AGE_MIN } from '../../scripts/gpu/config.ts'
import { ledgerVar, makeLabel, spentVar } from '../../scripts/gpu/names.ts'
import { memoryVars } from './fakes.ts'

const T0 = Date.parse('2026-11-27T12:00:00Z')
const MIN = 60_000
const label = (n: number) => makeLabel(String(n), '1', T0, `ab${String(n).padStart(2, '0')}cd`)

describe('the cap', () => {
  test('refuses at the cap, passes just under it', () => {
    expect(verdict(CAP_USD, 0).allowed).toBe(false)
    expect(verdict(CAP_USD - 0.01, 0).allowed).toBe(true)
    const v = verdict(CAP_USD + 3, 0)
    expect(v.allowed === false && v.reason.includes('cap')).toBe(true)
  })
  test('refuses at 3 pods running, passes at 2', () => {
    expect(MAX_RUNNING).toBe(3)
    expect(verdict(0, 3).allowed).toBe(false)
    expect(verdict(0, 2).allowed).toBe(true)
  })
  test('a foreign pod does not count: only ledger entries do, and only ax-ci ones are ever written', async () => {
    const vars = memoryVars({ SOMEONE_ELSES_VARIABLE: '{"label":"ruken","start":0,"costPerHr":99}' })
    expect(await spent(vars, T0)).toBe(0)
    expect(await entries(vars)).toHaveLength(0)
  })
})

describe('the ledger', () => {
  test('an open pod counts as running until now, at the price RunPod gave', async () => {
    const vars = memoryVars()
    await reserve(vars, label(1), T0)
    await priced(vars, label(1), 'pod1', 0.89)
    expect(Math.abs((await spent(vars, T0 + 30 * MIN)) - 0.445) < 1e-9).toBe(true)
  })
  test('before it is priced a pod is booked at the dearest card, so a crash after the create still counts', async () => {
    const vars = memoryVars()
    await reserve(vars, label(1), T0)
    expect(Math.abs((await spent(vars, T0 + 30 * MIN)) - 1.5) < 1e-9).toBe(true)
  })
  test('no pod is counted past the sweep age, whatever the entry says', () => {
    expect(costOf({ label: 'a', costPerHr: 6, start: 0 }, 10 * 60 * MIN)).toBe(6 * (SWEEP_AGE_MIN / 60))
  })
  test('a create that failed owes nothing', async () => {
    const vars = memoryVars()
    await reserve(vars, label(1), T0)
    await cancel(vars, label(1))
    expect(await spent(vars, T0 + 60 * MIN)).toBe(0)
  })
  test('closing twice keeps the first end time', async () => {
    const vars = memoryVars()
    await reserve(vars, label(1), T0)
    await close(vars, label(1), T0 + 10 * MIN)
    await close(vars, label(1), T0 + 20 * MIN)
    expect((await entries(vars))[0].end).toBe(T0 + 10 * MIN)
  })
  test('an entry whose pod is gone is closed; one still alive, or being made now, is not', async () => {
    const vars = memoryVars()
    await reserve(vars, label(1), T0)
    await priced(vars, label(1), 'p1', 1)
    await reserve(vars, label(2), T0)
    await priced(vars, label(2), 'p2', 1)
    await reserve(vars, label(3), T0)
    const closed = await reconcile(vars, new Set([label(2)]), T0 + 5 * MIN, [label(3)])
    expect(closed).toEqual([label(1)])
  })
  test('an entry made or priced in the last 2 minutes is left alone, even when its pod is not listed yet', async () => {
    const vars = memoryVars()
    await reserve(vars, label(1), T0)
    await priced(vars, label(1), 'p1', 1)
    expect(await reconcile(vars, new Set(), T0 + MIN, [])).toEqual([])
    expect(await reconcile(vars, new Set(), T0 + 3 * MIN, [])).toEqual([label(1)])
  })
  test('two writers closing at once lose no cost', async () => {
    const vars = memoryVars()
    for (const n of [1, 2]) {
      await reserve(vars, label(n), T0)
      await priced(vars, label(n), `p${n}`, 1.2)
    }
    await Promise.all([close(vars, label(1), T0 + 30 * MIN), close(vars, label(2), T0 + 30 * MIN)])
    expect(await fold(vars, T0 + 40 * MIN)).toBe(2)
    expect(Math.abs((await spent(vars, T0 + 40 * MIN)) - 1.2) < 1e-9).toBe(true)
  })
  test('a fold adds a closed pod to the month, then removes its variable; the total is the same before and after', async () => {
    const vars = memoryVars()
    await reserve(vars, label(1), T0)
    await priced(vars, label(1), 'p1', 0.6)
    await close(vars, label(1), T0 + 60 * MIN)
    const before = await spent(vars, T0 + 90 * MIN)
    await fold(vars, T0 + 90 * MIN)
    expect(vars.data.has(ledgerVar(label(1)))).toBe(false)
    expect(Math.abs((await spent(vars, T0 + 90 * MIN)) - before) < 1e-9).toBe(true)
  })
  test('a close cut off midway counts the pod once: the total was written but the variable stayed (Y4-2)', async () => {
    const vars = memoryVars()
    await reserve(vars, label(1), T0)
    await priced(vars, label(1), 'p1', 0.6)
    await close(vars, label(1), T0 + 30 * MIN)
    // The total is written, then the run is cancelled before the pod's variable is removed.
    vars.remove = async () => {
      throw new Error('cancelled midway')
    }
    await fold(vars, T0 + 40 * MIN).catch(() => undefined)
    expect(vars.data.has(spentVar(2026, 11))).toBe(true)
    expect(vars.data.has(ledgerVar(label(1)))).toBe(true)
    // Counted once while both exist ...
    expect(Math.abs((await spent(vars, T0 + 40 * MIN)) - 0.3) < 1e-9).toBe(true)
    // ... and a later fold adds nothing a second time.
    vars.remove = async (name) => void vars.data.delete(name)
    await fold(vars, T0 + 50 * MIN)
    expect(Math.abs((await spent(vars, T0 + 50 * MIN)) - 0.3) < 1e-9).toBe(true)
  })
  test('a pod from last month is folded into last month, not this one', async () => {
    const vars = memoryVars()
    const old = Date.parse('2026-10-31T23:50:00Z')
    await reserve(vars, label(1), old)
    await priced(vars, label(1), 'p1', 1)
    await close(vars, label(1), old + 5 * MIN)
    await fold(vars, T0)
    expect(vars.data.has(spentVar(2026, 10))).toBe(true)
    expect(await spent(vars, T0)).toBe(0)
  })
})
