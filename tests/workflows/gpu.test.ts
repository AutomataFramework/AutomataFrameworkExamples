// The GPU workflows are read as text and held to the rules in `gpu-rules.ts`. Each rule is also shown to fire: the real
// file is broken once for each rule and the rule must name it ("shown by breaking each once").
import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'bun:test'
import { forkGuardProblems, gpuProblems } from './gpu-rules.ts'
import { ciProblems, pinProblems, retentionProblems } from './workflow-rules.ts'

const read = (name: string): string => readFileSync(new URL(`../../.github/workflows/${name}`, import.meta.url), 'utf8')
const gpu = read('gpu.yml')
const guard = read('fork-guard.yml')
const ci = read('ci.yml')
const ALL = ['ci.yml', 'fork-guard.yml', 'gpu-image.yml', 'gpu.yml', 'private-names.yml']

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
    ['a variable in gpu-smoke', '        run: node scripts/gpu/smoke/render.ts "$RUNNER_TEMP/gpu-smoke.webp"\n', '        run: node scripts/gpu/smoke/render.ts "$RUNNER_TEMP/gpu-smoke.webp"\n        env:\n          X: ${{ vars.EXAMPLES_CI_APP_ID }}\n', 'gpu-smoke names `vars.`'],
    ['a second pod-start output', '      label: ${{ steps.label.outputs.label }}\n', '      label: ${{ steps.label.outputs.label }}\n      jit: ${{ steps.jit.outputs.jit }}\n', 'not just pod and label'],
    ['a pod job with no fork refusal', "    if: needs.plan.outputs.apply == 'true' && needs.plan.outputs.fork != 'true' && github.event_name != 'workflow_dispatch'\n    runs-on: [self-hosted", "    if: needs.plan.outputs.apply == 'true'\n    runs-on: [self-hosted", 'gpu-smoke has no fork refusal'],
    ['pod-stop running the change', '        run: node scripts/gpu/cli/stop.ts', '        run: pnpm test', 'pod-stop runs pnpm test'],
    ['pod-start checking out the change', /(  pod-start:[\s\S]*?uses: actions\/checkout@[^\n]*\n {8}with:\n)( {10}ref: [^\n]*\n)/, '$1          ref: ${{ github.event.pull_request.head.sha }}\n', 'pod-start checks out something other than the trusted base'],
    ['a job without a timeout', '    timeout-minutes: 12\n', '', 'pod-start has no timeout-minutes'],
    ['a changed pod-start timeout', 'timeout-minutes: 12', 'timeout-minutes: 30', 'timeout-minutes 30, not 12'],
    ['an upload without retention', '          retention-days: 3\n', '', 'an upload in gpu-smoke without `retention-days: 3`'],
    ['a build upload without retention', '          retention-days: 1\n', '', 'an upload in build-games without `retention-days: 1`'],
    ['a build upload kept 3 days', 'retention-days: 1\n', 'retention-days: 3\n', 'build-games without `retention-days: 1`'],
    ['gpu-smoke not waiting for build-games', 'needs: [plan, pod-start, build-games]', 'needs: [plan, pod-start]', 'gpu-smoke needs plan, pod-start, not exactly'],
    ['gpu-smoke waiting for watch too', 'needs: [plan, pod-start, build-games]', 'needs: [plan, pod-start, build-games, watch]', 'gpu-smoke needs'],
    ['the build job on a pod', '  build-games:\n    # On a GitHub runner with no secret: builds what the pod will open, so the pod needs no token and no run id.\n    # It does nothing until `harness/run.ts` exists (its steps check), so today\'s runs are unchanged.\n    needs: plan\n    if: needs.plan.outputs.apply == \'true\' && needs.plan.outputs.fork != \'true\' && github.event_name != \'workflow_dispatch\'\n    runs-on: ubuntu-latest', '  build-games:\n    needs: plan\n    if: needs.plan.outputs.apply == \'true\' && needs.plan.outputs.fork != \'true\' && github.event_name != \'workflow_dispatch\'\n    runs-on: [self-hosted, x]', 'job build-games does not run on `ubuntu-latest`'],
    ['the build job on a lookalike runner', /(  build-games:[\s\S]*?runs-on: )ubuntu-latest/, '$1ubuntu-latest-self-hosted', 'build-games does not run on `ubuntu-latest`'],
    ['no fork refusal on the build job', /(  build-games:[\s\S]*?if: needs\.plan\.outputs\.apply == 'true') && needs\.plan\.outputs\.fork != 'true'/, '$1', 'build-games has no fork refusal'],
    ['a secret in the build job', '    timeout-minutes: 15\n    permissions:\n      contents: read\n    steps:\n      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1\n        with:\n          persist-credentials: false\n      - id: has', '    timeout-minutes: 15\n    permissions:\n      contents: read\n    env:\n      K: ${{ secrets.EXAMPLES_CI_APP_KEY }}\n    steps:\n      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1\n        with:\n          persist-credentials: false\n      - id: has', 'build-games reads a secret or a variable'],
    ["a token in the pod's job", '    permissions: {}\n    steps:\n      - uses: actions/checkout', '    permissions: {}\n    env:\n      T: ${{ github.token }}\n    steps:\n      - uses: actions/checkout', 'gpu-smoke reaches a secret, a variable or a token'],
    ["secrets passed on to the pod's job", '    timeout-minutes: 15\n    permissions: {}', '    timeout-minutes: 15\n    secrets: inherit\n    permissions: {}', 'gpu-smoke reaches a secret, a variable or a token'],
    ['a secret in the ledger without its guard', "if: always() && (needs.pod-stop.result != 'skipped' || github.event_name == 'schedule')", 'if: always()', 'job ledger reads a secret without'],
    ['a secret in the sweep for any event', "    if: github.event_name == 'schedule'\n    runs-on: ubuntu-latest", '    runs-on: ubuntu-latest', 'job sweep reads a secret without'],
    ['a secret in a job nobody listed', '  watch:\n    needs: [plan, pod-start]', '  newjob:\n    runs-on: ubuntu-latest\n    timeout-minutes: 5\n    env:\n      K: ${{ secrets.RUNPOD_API_KEY }}\n    steps:\n      - run: echo\n\n  watch:\n    needs: [plan, pod-start]', 'job newjob reads a secret or a variable, which only'],
    ['pull_request_target in the triggers', '  push:\n    branches: [main]\n  merge_group:', '  pull_request_target:\n  push:\n    branches: [main]\n  merge_group:', 'gpu.yml runs on pull_request_target'],
    ['an aggregate that stops waiting for watch', 'needs: [plan, pod-start, gpu-smoke, watch, pod-stop]\n    if: always() && github.event_name != \'schedule\'', 'needs: [plan, pod-start, gpu-smoke, pod-stop]\n    if: always() && github.event_name != \'schedule\'', 'the `gpu` aggregate waits for'],
    ['a gpu aggregate without always()', "    if: always() && github.event_name != 'schedule'", "    if: github.event_name != 'schedule'", 'no `if: always()`'],
    ['a gpu aggregate that ignores watch', '          R_WATCH: ${{ needs.watch.result }}\n', '', "does not read watch's result"],
    ['watch with more permission', '      actions: write\n', '      actions: write\n      contents: write\n', 'watch has permissions other than'],
    ['a secret in plan', '          GITHUB_TOKEN: ${{ github.token }}\n        run: node scripts/gpu/cli/plan.ts', '          K: ${{ secrets.RUNPOD_API_KEY }}\n        run: node scripts/gpu/cli/plan.ts', 'plan reads a secret'],
    ['an unpinned action', 'actions/setup-node@820762786026740c76f36085b0efc47a31fe5020 # v7.0.0', 'actions/setup-node@v7', 'not pinned to a commit'],
    ['an image not pinned by digest', /ci-gpu@sha256:[0-9a-f]{64}/, 'ci-gpu:latest', 'does not pin the image by digest'],
    ['a ledger that can be cancelled', 'cancel-in-progress: false\n    permissions', 'cancel-in-progress: true\n    permissions', 'never cancelled'],
    ['cancel-in-progress for main', "cancel-in-progress: ${{ github.event_name == 'pull_request' }}", 'cancel-in-progress: true', 'cancel-in-progress is not limited'],
    ['an environment name the smoke refuses', '        run: node scripts/gpu/smoke/render.ts "$RUNNER_TEMP/gpu-smoke.webp"\n', '        run: node scripts/gpu/smoke/render.ts\n        env:\n          AX_SMOKE_OUT: x\n', 'gpu-smoke sets AX_SMOKE_OUT'],
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
    ['no failing exit', /exit 1/g, 'exit 0', 'does not fail a fork'],
    ['no merge queue run', 'merge_group:', 'workflow_dispatch:', 'merge queue'],
    ['a hidden failed draft', 'if ! gh pr ready --undo "$PR" --repo "$REPO"; then', 'gh pr ready --undo "$PR" --repo "$REPO" || true; if false; then', '|| true'],
    ['no draft check afterwards', /--json isDraft/g, '--json state', 'check the pull request is a draft'],
    ['text a fork controls in a script', 'PR: ${{ github.event.pull_request.number }}', 'PR: ${{ github.event.pull_request.title }}', 'text a fork controls'],
  ]
  for (const [name, from, to, expected] of breaks) {
    test(`fails on ${name}`, () => {
      expect(forkGuardProblems(broken(guard, from, to)).some((x) => x.includes(expected))).toBe(true)
    })
  }
})

describe('every workflow', () => {
  for (const name of ALL) {
    test(`${name} pins every action and keeps every upload`, () => {
      const text = read(name)
      expect(pinProblems(text)).toEqual([])
      expect(retentionProblems(text)).toEqual([])
    })
  }
  test('a tag instead of a commit is found', () => {
    for (const name of ALL) {
      const text = read(name)
      const m = /uses: ([^@\s]+)@[0-9a-f]{40}/.exec(text)
      if (!m) continue
      expect(pinProblems(broken(text, m[0], `uses: ${m[1]}@v4`)).some((x) => x.includes('not pinned'))).toBe(true)
    }
  })
  test('an action with no version is found', () => {
    expect(pinProblems(broken(ci, /uses: actions\/checkout@[0-9a-f]{40}/, 'uses: actions/checkout')).some((x) => x.includes('no version'))).toBe(true)
  })
  test('an upload with no retention, or the 90-day default, is found', () => {
    const up = '      - uses: actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9 # v7.0.2\n        with:\n          name: x\n          path: y\n'
    expect(retentionProblems(up).length).toBe(1)
    expect(retentionProblems(up + '          retention-days: 90\n').length).toBe(1)
    expect(retentionProblems(up + '          retention-days: 3\n')).toEqual([])
  })
})

describe('ci.yml', () => {
  test('breaks none of the rules', () => {
    expect(ciProblems(ci)).toEqual([])
  })
  const breaks: [string, string | RegExp, string, string][] = [
    ['a gate that does not wait for games', 'needs: [plan, checks, games, commit-authors]', 'needs: [plan, checks, commit-authors]', 'gate does not wait for games'],
    ['a gate that does not read a result', '          AUTHORS: ${{ needs.commit-authors.result }}\n', '', "gate does not read commit-authors's result"],
    ['a gate that does not always run', '    if: always()\n    runs-on: ubuntu-latest\n    timeout-minutes: 5\n    steps:\n      - name: Every check', '    runs-on: ubuntu-latest\n    timeout-minutes: 5\n    steps:\n      - name: Every check', 'gate has no `if: always()`'],
    ['a new job the gate does not know', '  commit-authors:\n', '  lint:\n    runs-on: ubuntu-latest\n    timeout-minutes: 5\n    steps:\n      - run: echo\n\n  commit-authors:\n', 'gate does not wait for lint'],
    ['a secret', '          GH_TOKEN: ${{ github.token }}\n          EVENT', '          GH_TOKEN: ${{ secrets.RUNPOD_API_KEY }}\n          EVENT', 'ci.yml reads a secret or a variable'],
    ['a variable', 'node-version: 24.21.0\n      - run: pnpm install --frozen-lockfile\n      - run: pnpm test', 'node-version: ${{ vars.NODE }}\n      - run: pnpm install --frozen-lockfile\n      - run: pnpm test', 'ci.yml reads a secret or a variable'],
    ['pull_request_target', '  pull_request:\n', '  pull_request_target:\n', 'ci.yml runs on pull_request_target'],
    ['a pod runner', '  checks:\n    needs: plan\n    if: needs.plan.outputs.docs != \'true\'\n    runs-on: ubuntu-latest', '  checks:\n    needs: plan\n    if: needs.plan.outputs.docs != \'true\'\n    runs-on: self-hosted', 'ci.yml asks for a self-hosted runner'],
    ['a job without a timeout', '    timeout-minutes: 15\n    steps:\n      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1\n        with:\n          persist-credentials: false\n      - uses: pnpm/action-setup@ea17c68df8912ef543352723c149a84f56e3d413 # v6.1.0\n      - uses: actions/setup-node@820762786026740c76f36085b0efc47a31fe5020 # v7.0.0\n        with:\n          node-version: 24.21.0\n      - run: pnpm install --frozen-lockfile\n      - name: Every game', '    steps:\n      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1\n        with:\n          persist-credentials: false\n      - uses: pnpm/action-setup@ea17c68df8912ef543352723c149a84f56e3d413 # v6.1.0\n      - uses: actions/setup-node@820762786026740c76f36085b0efc47a31fe5020 # v7.0.0\n        with:\n          node-version: 24.21.0\n      - run: pnpm install --frozen-lockfile\n      - name: Every game', 'job games has no timeout-minutes'],
  ]
  for (const [name, from, to, expected] of breaks) {
    test(`fails on ${name}`, () => {
      expect(ciProblems(broken(ci, from, to)).some((x) => x.includes(expected))).toBe(true)
    })
  }
})
