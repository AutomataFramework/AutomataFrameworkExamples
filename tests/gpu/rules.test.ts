// The pod rules on the new shape only (unit U2-3): `gpu-smoke` needs `build-games`, downloads that run's artifact and may
// run up to 30 minutes. U2-1 had them accept both shapes; the old one is no longer allowed. Each rule is shown not to
// open a hole by breaking the real file.
import { readFileSync } from 'node:fs'
import { describe, test } from 'node:test'
import { expect } from '../expect.ts'
import { gpuProblems } from '../workflows/gpu-rules.ts'

const file = readFileSync(new URL('../../.github/workflows/gpu.yml', import.meta.url), 'utf8')
const SHA = /actions\/download-artifact@([0-9a-f]{40})/.exec(file)![1]

function replaced(text: string, from: string | RegExp, to: string): string {
  const out = text.replace(from, to)
  if (out === text) throw new Error(`the test's change did not change the file: ${String(from)}`)
  return out
}

const next = (): string => file

const smokeJob = (text: string): string => /\n  gpu-smoke:\n[\s\S]*?\n  watch:/.exec(text)![0]
const has = (text: string, part: string): boolean => gpuProblems(text).some((x) => x.includes(part))

describe('the pod rules hold the new shape', () => {
  test('the gpu.yml in the repo', () => {
    expect(gpuProblems(file)).toEqual([])
  })
  test('the old shape is refused: no build-games, and gpu-smoke not waiting for it', () => {
    expect(has(replaced(file, 'needs: [plan, pod-start, build-games]', 'needs: [plan, pod-start]'), 'gpu-smoke needs plan, pod-start, not exactly')).toBe(true)
    expect(has(replaced(file, /\n {2}build-games:\n[\s\S]*?(?=\n {2}gpu-smoke:\n)/, ''), 'the build-games job is missing')).toBe(true)
  })
  test('gpu-smoke may run any time up to 30 minutes, and 31 is too long', () => {
    expect(gpuProblems(replaced(file, /(  gpu-smoke:[\s\S]*?timeout-minutes: )15/, '$130'))).toEqual([])
    expect(has(replaced(file, /(  gpu-smoke:[\s\S]*?timeout-minutes: )15/, '$131'), 'gpu-smoke has timeout-minutes 31')).toBe(true)
  })
  test('the other jobs keep their exact limits', () => {
    expect(has(replaced(file, '    timeout-minutes: 12\n', '    timeout-minutes: 30\n'), 'timeout-minutes 30, not 12')).toBe(true)
    expect(has(replaced(file, /(  watch:[\s\S]*?timeout-minutes: )20/, '$130'), 'job watch has timeout-minutes 30, not 20')).toBe(true)
  })
})

describe('the new shape opens no hole', () => {
  test('a secret in gpu-smoke still fails', () => {
    expect(has(replaced(next(), '    permissions: {}\n    steps:\n      - uses: actions/checkout', '    permissions: {}\n    env:\n      K: ${{ secrets.RUNPOD_API_KEY }}\n    steps:\n      - uses: actions/checkout'), 'gpu-smoke names `secrets.`')).toBe(true)
  })
  test('a variable in gpu-smoke still fails', () => {
    expect(has(replaced(next(), '      - name: Draw with WebGL on the GPU\n', '      - name: Draw with WebGL on the GPU\n        if: ${{ vars.EXAMPLES_CI_APP_ID }}\n'), 'gpu-smoke names `vars.`')).toBe(true)
  })
  test('a fork reaching a pod still fails: no fork refusal on gpu-smoke', () => {
    expect(has(replaced(next(), "needs.plan.outputs.apply == 'true' && needs.plan.outputs.fork != 'true' && github.event_name != 'workflow_dispatch'\n    runs-on: [self-hosted", "needs.plan.outputs.apply == 'true'\n    runs-on: [self-hosted"), 'gpu-smoke has no fork refusal')).toBe(true)
  })
  test('an unpinned action still fails, in the downloading step and in build-games', () => {
    expect(has(replaced(next(), `actions/download-artifact@${SHA} # v8.0.1`, 'actions/download-artifact@v7'), 'actions/download-artifact is not pinned')).toBe(true)
    expect(has(replaced(next(), /actions\/upload-artifact@[0-9a-f]{40} # v7\.0\.2\n        with:\n          name: games-built/, 'actions/upload-artifact@v7\n        with:\n          name: games-built'), 'actions/upload-artifact is not pinned')).toBe(true)
  })
  test('gpu-smoke needs build-games and nothing beyond plan and pod-start', () => {
    for (const other of ['fresh-agent-smooth', 'build', 'ledger', 'gpu']) {
      const t = replaced(next(), 'needs: [plan, pod-start, build-games]', `needs: [plan, pod-start, build-games, ${other}]`)
      expect(has(t, 'not exactly build-games, plan, pod-start')).toBe(true)
    }
    expect(has(replaced(next(), 'needs: [plan, pod-start, build-games]', 'needs: [plan, pod-start, fresh-agent-smooth]'), 'gpu-smoke needs fresh-agent-smooth')).toBe(true)
  })
  test('gpu-smoke needs written as a list is read too', () => {
    const t = replaced(next(), 'needs: [plan, pod-start, build-games]', 'needs:\n      - plan\n      - pod-start\n      - build-games')
    expect(gpuProblems(t)).toEqual([])
    expect(has(replaced(t, '      - build-games', '      - build-games\n      - fresh-agent-smooth'), 'not exactly build-games, plan, pod-start')).toBe(true)
  })
  test('the download is this run\'s artifact: no run id, no token, no other repository', () => {
    for (const [key, value] of [['run-id', '12345'], ['github-token', '${{ github.token }}'], ['repository', 'someone/else']]) {
      const t = replaced(next(), /(actions\/download-artifact@[^\n]*\n        with:\n          name: games-built\n)/, `$1          ${key}: ${value}\n`)
      expect(has(t, `gpu-smoke downloads an artifact with ${key}`)).toBe(true)
    }
  })
  test('gpu-smoke still reads only the three outputs, and none from build-games', () => {
    const t = replaced(next(), '      - name: Draw with WebGL on the GPU\n', '      - name: Draw with WebGL on the GPU\n        if: ${{ needs.build-games.outputs.token }}\n')
    expect(has(t, 'gpu-smoke reads needs.build-games.outputs.token')).toBe(true)
  })
  test('build-games runs on GitHub\'s runners and names no secret or variable', () => {
    expect(has(replaced(next(), /(  build-games:[\s\S]*?runs-on: )ubuntu-latest/, '$1[self-hosted, x]'), 'job build-games does not run on `ubuntu-latest`')).toBe(true)
    expect(has(replaced(next(), /(  build-games:[\s\S]*?permissions:\n      contents: read\n)/, '$1    env:\n      K: ${{ secrets.RUNPOD_API_KEY }}\n'), 'build-games reads a secret or a variable')).toBe(true)
    expect(has(replaced(next(), /(  build-games:[\s\S]*?permissions:\n      contents: read\n)/, '$1    env:\n      K: ${{ vars.EXAMPLES_CI_APP_ID }}\n'), 'build-games reads a secret or a variable')).toBe(true)
  })
  test('build-games has a time limit', () => {
    expect(has(replaced(next(), '    timeout-minutes: 15\n    permissions:\n      contents: read\n    steps:\n      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1\n        with:\n          persist-credentials: false\n      - id: has', '    permissions:\n      contents: read\n    steps:\n      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1\n        with:\n          persist-credentials: false\n      - id: has'), 'job build-games has no timeout-minutes')).toBe(true)
  })
  test('an upload keeps 1 to 3 days, never longer and never forever', () => {
    expect(has(replaced(next(), 'retention-days: 1\n', 'retention-days: 4\n'), 'an upload in build-games without `retention-days: 1`')).toBe(true)
    expect(has(replaced(next(), 'retention-days: 1\n', ''), 'an upload in build-games without `retention-days: 1`')).toBe(true)
    expect(has(replaced(next(), 'retention-days: 1\n', 'retention-days: 3\n'), 'build-games without `retention-days: 1`')).toBe(true)
  })
  test('the new smoke job is still the one that asks for its own pod label', () => {
    expect(smokeJob(next())).toContain("runs-on: [self-hosted, '${{ needs.pod-start.outputs.label }}']")
  })
})
