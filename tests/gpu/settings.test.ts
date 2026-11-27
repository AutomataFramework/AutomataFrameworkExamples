// Each behaviour setting is pinned: the test fails when the value is put back to anything else (the spec's rule).
import { describe, expect, test } from 'bun:test'
import * as c from '../../scripts/gpu/config.ts'

describe('the gate settings', () => {
  test('the GPU order, cheapest first, NVIDIA only', () => {
    expect([...c.GPU_ORDER]).toEqual([
      'NVIDIA GeForce RTX 4090',
      'NVIDIA RTX A6000',
      'NVIDIA L4',
      'NVIDIA A40',
      'NVIDIA GeForce RTX 5090',
    ])
    for (const g of c.GPU_ORDER) expect(c.isGpuName(g)).toBe(true)
    expect(c.MAX_PRICE_PER_HOUR).toBe(3)
  })
  test('secure cloud only: a community host can read the pod', () => {
    expect(c.CLOUD).toBe('SECURE')
  })
  test('the runner has 5 minutes to come online', () => {
    expect(c.ONLINE_WAIT_MS).toBe(5 * 60 * 1000)
  })
  test('watch waits 3 minutes for gpu-smoke to start', () => {
    expect(c.WATCH_GRACE_MS).toBe(3 * 60 * 1000)
  })
  test('the job on the pod may run 30 minutes', () => {
    expect(c.SMOKE_TIMEOUT_MIN).toBe(30)
  })
  test('the sweep deletes pods older than 50 minutes: the three timeouts (12 + 30 + 5) plus 3', () => {
    expect(c.SWEEP_AGE_MIN).toBe(50)
    expect(c.SWEEP_AGE_MIN).toBe(12 + c.SMOKE_TIMEOUT_MIN + 5 + 3)
  })
  test('at most 3 ax-ci pods run at once', () => {
    expect(c.MAX_RUNNING).toBe(3)
  })
  test('the cap is $25: the $50 is split with Editors because billing cannot be grouped by pod name', () => {
    expect(c.CAP_USD).toBe(25)
  })
  test('a pod never outlives its runner by long, and the sweep age covers its whole life', () => {
    expect(c.IDLE_LIMIT_MIN).toBe(13)
    expect(c.JOB_LIMIT_MIN).toBe(35)
    // The pod deletes itself 5 minutes after the job's own time limit, as it did when the limit was 15 and this was 20.
    expect(c.JOB_LIMIT_MIN).toBe(c.SMOKE_TIMEOUT_MIN + 5)
    // The worst case of a pod's life is the idle wait plus the job limit; the sweep age must be past it.
    expect(c.IDLE_LIMIT_MIN + c.JOB_LIMIT_MIN < c.SWEEP_AGE_MIN + 1).toBe(true)
    // The idle limit covers the online wait twice (a replacement) and the watch's grace.
    expect(c.IDLE_LIMIT_MIN * 60_000 >= c.ONLINE_WAIT_MS + c.WATCH_GRACE_MS).toBe(true)
  })
  test('the pods are named ax-ci-, never the Editors prefix', () => {
    expect(c.POD_PREFIX).toBe('ax-ci-')
  })
  test('one job only: gpu-smoke', () => {
    expect(c.ALLOWED_JOB).toBe('gpu-smoke')
  })
  test('no key name is on the environment allowlist', () => {
    for (const n of c.ENV_ALLOWLIST) {
      expect(c.ENV_FORBIDDEN_PREFIXES.some((p) => n.startsWith(p))).toBe(false)
      expect(n).not.toContain('KEY')
      expect(n).not.toContain('TOKEN')
    }
    expect(c.ENV_FORBIDDEN_PREFIXES).toContain('RUNPOD_')
  })
})
