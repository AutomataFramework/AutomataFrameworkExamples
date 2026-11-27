import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { judge, plan, queuePr, type Results } from '../../scripts/gpu/decide.ts'
import { isOurs, labelTime, ledgerVar, makeLabel, podPrefix, replacementName, spentVar } from '../../scripts/gpu/names.ts'
import { expect } from '../expect.ts'

describe('names', () => {
  const now = Date.parse('2026-11-27T12:00:00Z')
  test('a label starts with the run attempt prefix, and carries its time', () => {
    const label = makeLabel('123456', '2', now, 'ab12cd')
    expect(label.startsWith(podPrefix('123456', '2'))).toBe(true)
    expect(label.startsWith('ax-ci-123456-2-')).toBe(true)
    expect(labelTime(label)).toBe(now)
    expect(labelTime(replacementName(label))).toBe(now)
  })
  test('a label is not made from a random part with odd characters', () => {
    assert.throws(() => makeLabel('1', '1', now, 'AB-!'))
  })
  test('only ax-ci names are ours: the Editors prefix and other pods are not', () => {
    expect(isOurs('ax-ci-1-1-x')).toBe(true)
    expect(isOurs('ae-ci-1-1-x')).toBe(false)
    expect(isOurs('some-other-pod')).toBe(false)
  })
  test('ledger variables use letters, digits and underscores only (Y4-1)', () => {
    const v = ledgerVar(makeLabel('9', '1', now, 'ab12cd'))
    expect(/^[A-Z0-9_]+$/.test(v)).toBe(true)
    expect(v.startsWith('AX_CI_LEDGER_')).toBe(true)
    expect(spentVar(2026, 3)).toBe('AX_CI_SPENT_2026_03')
  })
})

describe('plan', () => {
  const repo = 'AutomataFramework/AutomataFrameworkExamples'
  const base = { event: 'pull_request', actor: 'someone', repo, headRepo: repo, files: ['scripts/x.ts'] }
  test('a pull request from this repo applies', () => {
    expect(plan(base)).toEqual({ apply: true, fork: false, passes: false, why: 'the GPU check applies' })
  })
  test('a fork in a pull request is refused: no pod, and gpu fails', () => {
    const p = plan({ ...base, headRepo: 'someone/AutomataFrameworkExamples' })
    expect(p.apply).toBe(false)
    expect(p.fork).toBe(true)
  })
  test('a fork in the merge queue is refused too', () => {
    const p = plan({ ...base, event: 'merge_group', headRepo: 'someone/AutomataFrameworkExamples' })
    expect(p.fork).toBe(true)
  })
  test('a head repository that cannot be read counts as a fork', () => {
    expect(plan({ ...base, headRepo: null }).fork).toBe(true)
  })
  test('a fork is refused even when it is a Dependabot pull request or changes only docs', () => {
    expect(plan({ ...base, headRepo: 'x/y', actor: 'dependabot[bot]', files: ['docs/a.md'] }).fork).toBe(true)
  })
  test('Dependabot gets no secrets, so its pull request passes and the queue does the GPU check', () => {
    const p = plan({ ...base, actor: 'dependabot[bot]' })
    expect(p).toEqual({ apply: false, fork: false, passes: true, why: 'runs in the queue' })
  })
  test('a change to Markdown people read only is not applicable', () => {
    expect(plan({ ...base, files: ['CLAUDE.md', 'docs/superpowers/progress.md'] }).passes).toBe(true)
    expect(plan({ ...base, files: ['CLAUDE.md', 'scripts/a.ts'] }).apply).toBe(true)
  })
  test('a file list GitHub could not give runs the check', () => {
    expect(plan({ ...base, files: null }).apply).toBe(true)
  })
  test('a push to main applies, docs or not', () => {
    expect(plan({ ...base, event: 'push', files: null }).apply).toBe(true)
  })
  test('the queue branch names its pull request', () => {
    expect(queuePr('gh-readonly-queue/main/pr-12-0123abcd')).toBe(12)
    expect(queuePr('refs/heads/gh-readonly-queue/main/pr-7-ffee00')).toBe(7)
    expect(queuePr('main')).toBeNull()
  })
})

describe('the gpu aggregate', () => {
  const ok: Results = { plan: 'success', podStart: 'success', gpuSmoke: 'success', watch: 'success', podStop: 'success' }
  const applies = plan({ event: 'pull_request', actor: 'a', repo: 'o/r', headRepo: 'o/r', files: ['a.ts'] })
  test('passes when every job that applies succeeded', () => {
    expect(judge(applies, ok).pass).toBe(true)
  })
  test('a cancelled job fails it (a run watch cancels cannot pass)', () => {
    expect(judge(applies, { ...ok, gpuSmoke: 'cancelled', watch: 'success' }).pass).toBe(false)
    expect(judge(applies, { ...ok, watch: 'cancelled' }).pass).toBe(false)
  })
  test('a job skipped because something before it failed fails it', () => {
    const r = judge(applies, { ...ok, podStart: 'failure', gpuSmoke: 'skipped', watch: 'skipped' })
    expect(r.pass).toBe(false)
    expect(r.why).toContain('gpuSmoke skipped')
  })
  test('a pod that was not stopped cleanly fails it', () => {
    expect(judge(applies, { ...ok, podStop: 'failure' }).pass).toBe(false)
  })
  test('docs only passes with "not applicable"; Dependabot passes with "runs in the queue"', () => {
    const skipped: Results = { plan: 'success', podStart: 'skipped', gpuSmoke: 'skipped', watch: 'skipped', podStop: 'skipped' }
    const docs = plan({ event: 'pull_request', actor: 'a', repo: 'o/r', headRepo: 'o/r', files: ['docs/a.md'] })
    expect(judge(docs, skipped)).toEqual({ pass: true, why: 'not applicable: only Markdown people read changed' })
    const bot = plan({ event: 'pull_request', actor: 'dependabot[bot]', repo: 'o/r', headRepo: 'o/r', files: ['a.ts'] })
    expect(judge(bot, skipped)).toEqual({ pass: true, why: 'runs in the queue' })
  })
  test('a fork fails it, always', () => {
    const fork = plan({ event: 'pull_request', actor: 'a', repo: 'o/r', headRepo: 'x/r', files: ['a.ts'] })
    const skipped: Results = { plan: 'success', podStart: 'skipped', gpuSmoke: 'skipped', watch: 'skipped', podStop: 'skipped' }
    expect(judge(fork, skipped).pass).toBe(false)
  })
  test('a plan that did not succeed fails it', () => {
    expect(judge(applies, { ...ok, plan: 'failure' }).pass).toBe(false)
  })
  test('the label shape the Editors gate also parses: ax-ci-<run>-<attempt>-<8 base-36 time><random>, and -2 for a replacement', () => {
    const t = Date.parse('2026-11-27T14:00:00Z')
    const label = makeLabel('46010671607', '1', t, 'ab12cd')
    expect(/^ax-ci-\d+-\d+-([0-9a-z]{8})[0-9a-z]{4,}(-\d)?$/.test(label)).toBe(true)
    expect(labelTime(label)).toBe(t)
    expect(labelTime(replacementName(label))).toBe(t)
  })
})
