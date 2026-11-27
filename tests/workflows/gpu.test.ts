// The GPU workflows are read as text and held to the rules in `gpu-rules.ts`. Each rule is also shown to fire: the real
// file is broken once for each rule and the rule must name it ("shown by breaking each once").
import { readFileSync } from 'node:fs'
import { describe, test } from 'node:test'
import { expect } from '../expect.ts'
import { forkGuardProblems, gpuProblems } from './gpu-rules.ts'

const read = (name: string): string => readFileSync(new URL(`../../.github/workflows/${name}`, import.meta.url), 'utf8')
const gpu = read('gpu.yml')
const guard = read('fork-guard.yml')

function broken(text: string, from: string | RegExp, to: string): string {
  const out = text.replace(from, to)
  if (out === text) throw new Error(`the test's break did not change the file: ${String(from)}`)
  return out
}

describe('gpu.yml', () => {
  test('breaks none of the rules', () => {
    expect(gpuProblems(gpu)).toEqual([])
  })

  const breaks: [string, string | RegExp, string, string][] = [
    ['a workflow-level env', '\nconcurrency:', '\nenv:\n  A: b\n\nconcurrency:', 'workflow-level `env`'],
    ['`edited` in the triggers', 'ready_for_review]', 'ready_for_review, edited]', '`edited`'],
    ['a secret in gpu-smoke', '    permissions: {}\n    steps:\n      - uses: actions/checkout', '    permissions: {}\n    env:\n      K: ${{ secrets.RUNPOD_API_KEY }}\n    steps:\n      - uses: actions/checkout', 'gpu-smoke names `secrets.`'],
    ['a variable in gpu-smoke', '          AX_SMOKE_OUT:', '          X: ${{ vars.EXAMPLES_CI_APP_ID }}\n          AX_SMOKE_OUT:', 'gpu-smoke names `vars.`'],
    ['a second pod-start output', '      label: ${{ steps.label.outputs.label }}\n', '      label: ${{ steps.label.outputs.label }}\n      jit: ${{ steps.jit.outputs.jit }}\n', 'not just pod and label'],
    ['a pod job with no fork refusal', "    if: needs.plan.outputs.apply == 'true' && needs.plan.outputs.fork != 'true' && github.event_name != 'workflow_dispatch'\n    runs-on: [self-hosted", "    if: needs.plan.outputs.apply == 'true'\n    runs-on: [self-hosted", 'gpu-smoke has no fork refusal'],
    ['pod-stop running the change', '        run: node scripts/gpu/cli/stop.ts', '        run: pnpm test', 'pod-stop runs pnpm test'],
    ['pod-start checking out the change', /(  pod-start:[\s\S]*?uses: actions\/checkout@[^\n]*\n {8}with:\n)( {10}ref: [^\n]*\n)/, '$1          ref: ${{ github.event.pull_request.head.sha }}\n', 'pod-start checks out something other than the trusted base'],
    ['a job without a timeout', '    timeout-minutes: 12\n', '', 'pod-start has no timeout-minutes'],
    ['a changed pod-start timeout', 'timeout-minutes: 12', 'timeout-minutes: 30', 'timeout-minutes 30, not 12'],
    ['an upload without retention', '          retention-days: 3\n', '', 'an upload without `retention-days: 3`'],
    ['a gpu aggregate without always()', "    if: always() && github.event_name != 'schedule'", "    if: github.event_name != 'schedule'", 'no `if: always()`'],
    ['a gpu aggregate that ignores watch', '          R_WATCH: ${{ needs.watch.result }}\n', '', "does not read watch's result"],
    ['watch with more permission', '      actions: write\n', '      actions: write\n      contents: write\n', 'watch has permissions other than'],
    ['a secret in plan', '          GITHUB_TOKEN: ${{ github.token }}\n        run: node scripts/gpu/cli/plan.ts', '          K: ${{ secrets.RUNPOD_API_KEY }}\n        run: node scripts/gpu/cli/plan.ts', 'plan reads a secret'],
    ['an unpinned action', 'actions/setup-node@820762786026740c76f36085b0efc47a31fe5020 # v7.0.0', 'actions/setup-node@v7', 'not pinned to a commit'],
    ['an image not pinned by digest', /ci-gpu@sha256:0{64}/, 'ci-gpu:latest', 'does not pin the image by digest'],
    ['a ledger that can be cancelled', 'cancel-in-progress: false\n    permissions', 'cancel-in-progress: true\n    permissions', 'never cancelled'],
    ['cancel-in-progress for main', "cancel-in-progress: ${{ github.event_name == 'pull_request' }}", 'cancel-in-progress: true', 'cancel-in-progress is not limited'],
    ['gpu-smoke asking for plain self-hosted', "runs-on: [self-hosted, '${{ needs.pod-start.outputs.label }}']", 'runs-on: self-hosted', 'own pod label'],
  ]
  for (const [name, from, to, expected] of breaks) {
    test(`fails on ${name}`, () => {
      const problems = gpuProblems(broken(gpu, from, to))
      expect(problems.some((x) => x.includes(expected))).toBe(true)
    })
  }

  test('a pod-stop that does not always run is found', () => {
    expect(gpuProblems(broken(gpu, "if: always() && needs.plan.outputs.apply == 'true' && needs.plan.outputs.fork != 'true' && github.event_name != 'workflow_dispatch'\n    runs-on: ubuntu-latest\n    timeout-minutes: 5", "if: needs.plan.outputs.apply == 'true' && needs.plan.outputs.fork != 'true' && github.event_name != 'workflow_dispatch'\n    runs-on: ubuntu-latest\n    timeout-minutes: 5")).some((x) => x.includes('pod-stop does not always run'))).toBe(true)
  })
})

describe('fork-guard.yml', () => {
  test('breaks none of the rules', () => {
    expect(forkGuardProblems(guard)).toEqual([])
  })
  const breaks: [string, string | RegExp, string, string][] = [
    ['a run on pull_request instead of pull_request_target', 'pull_request_target:', 'pull_request:', 'pull_request_target'],
    ['no ready_for_review', 'synchronize, ready_for_review]', 'synchronize]', 'ready_for_review'],
    ['a checkout', '    steps:\n', '    steps:\n      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1\n', 'checks out something'],
    ['another permission', '      pull-requests: write\n', '      pull-requests: write\n      contents: write\n', 'not only pull-requests: write'],
    ['no draft step', 'gh pr ready --undo', 'echo', 'draft'],
    ['no failing exit', 'exit 1', 'exit 0', 'does not fail a fork'],
    ['no merge queue run', 'merge_group:', 'workflow_dispatch:', 'merge queue'],
    ['text a fork controls in a script', 'PR: ${{ github.event.pull_request.number }}', 'PR: ${{ github.event.pull_request.title }}', 'text a fork controls'],
  ]
  for (const [name, from, to, expected] of breaks) {
    test(`fails on ${name}`, () => {
      expect(forkGuardProblems(broken(guard, from, to)).some((x) => x.includes(expected))).toBe(true)
    })
  }
})
