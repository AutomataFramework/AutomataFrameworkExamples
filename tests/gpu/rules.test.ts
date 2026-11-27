// The loosened pod rules (unit U2-1): they accept today's `gpu.yml` and the one the next unit brings, in which
// `gpu-smoke` also needs a `build-games` job, downloads that run's artifact and may run 30 minutes. The new shape is
// made here from the real file, so no workflow file changes in this unit. Each loosening is shown not to open a hole.
import { readFileSync } from 'node:fs'
import { describe, test } from 'node:test'
import { expect } from '../expect.ts'
import { gpuProblems } from '../workflows/gpu-rules.ts'

const today = readFileSync(new URL('../../.github/workflows/gpu.yml', import.meta.url), 'utf8')
const SHA = 'a'.repeat(40)

function replaced(text: string, from: string | RegExp, to: string): string {
  const out = text.replace(from, to)
  if (out === text) throw new Error(`the test's change did not change the file: ${String(from)}`)
  return out
}

const BUILD_JOB = `  build-games:
    needs: [plan]
    if: needs.plan.outputs.apply == 'true'
    runs-on: ubuntu-latest
    timeout-minutes: 20
    permissions:
      contents: read
    steps:
      - uses: actions/checkout@${SHA} # v7.0.1
        with:
          persist-credentials: false
      - uses: actions/upload-artifact@${SHA} # v7.0.2
        with:
          name: built-games
          path: dist
          retention-days: 1
          if-no-files-found: error

`
const DOWNLOAD = `      - uses: actions/download-artifact@${SHA} # v7.0.0
        with:
          name: built-games
          path: \${{ runner.temp }}/built
`

/** What U2-2 is planned to bring: the build job, `gpu-smoke` needing it, downloading its artifact, 30 minutes. */
function next(text: string = today): string {
  let t = replaced(text, '\n  gpu-smoke:\n', `\n${BUILD_JOB}  gpu-smoke:\n`)
  t = replaced(t, '    needs: [plan, pod-start]\n    if: needs.plan.outputs.apply == \'true\' && needs.plan.outputs.fork != \'true\' && github.event_name != \'workflow_dispatch\'\n    runs-on: [self-hosted', '    needs: [plan, pod-start, build-games]\n    if: needs.plan.outputs.apply == \'true\' && needs.plan.outputs.fork != \'true\' && github.event_name != \'workflow_dispatch\'\n    runs-on: [self-hosted')
  t = replaced(t, /(  gpu-smoke:[\s\S]*?timeout-minutes: )15/, '$130')
  t = replaced(t, '      - name: The GPU, the key\'s scope', `${DOWNLOAD}      - name: The GPU, the key's scope`)
  return t
}

const smokeJob = (text: string): string => /\n  gpu-smoke:\n[\s\S]*?\n  watch:/.exec(text)![0]
const has = (text: string, part: string): boolean => gpuProblems(text).some((x) => x.includes(part))

describe('the pod rules accept both shapes', () => {
  test('today\'s gpu.yml', () => {
    expect(gpuProblems(today)).toEqual([])
  })
  test('the next one: build-games, its artifact downloaded, 30 minutes', () => {
    expect(gpuProblems(next())).toEqual([])
  })
  test('gpu-smoke may run any time up to 30 minutes, and 31 is too long', () => {
    expect(gpuProblems(replaced(today, /(  gpu-smoke:[\s\S]*?timeout-minutes: )15/, '$130'))).toEqual([])
    expect(has(replaced(today, /(  gpu-smoke:[\s\S]*?timeout-minutes: )15/, '$131'), 'gpu-smoke has timeout-minutes 31')).toBe(true)
  })
  test('the other jobs keep their exact limits', () => {
    expect(has(replaced(today, '    timeout-minutes: 12\n', '    timeout-minutes: 30\n'), 'timeout-minutes 30, not 12')).toBe(true)
    expect(has(replaced(today, /(  watch:[\s\S]*?timeout-minutes: )20/, '$130'), 'job watch has timeout-minutes 30, not 20')).toBe(true)
  })
})

describe('the loosening opens no hole', () => {
  test('a secret in gpu-smoke still fails, in the new shape too', () => {
    expect(has(replaced(next(), '    permissions: {}\n    steps:\n      - uses: actions/checkout', '    permissions: {}\n    env:\n      K: ${{ secrets.RUNPOD_API_KEY }}\n    steps:\n      - uses: actions/checkout'), 'gpu-smoke names `secrets.`')).toBe(true)
  })
  test('a variable in gpu-smoke still fails, in the new shape too', () => {
    expect(has(replaced(next(), '      - name: Draw with WebGL on the GPU\n', '      - name: Draw with WebGL on the GPU\n        if: ${{ vars.EXAMPLES_CI_APP_ID }}\n'), 'gpu-smoke names `vars.`')).toBe(true)
  })
  test('a fork reaching a pod still fails: no fork refusal on gpu-smoke', () => {
    expect(has(replaced(next(), "needs.plan.outputs.apply == 'true' && needs.plan.outputs.fork != 'true' && github.event_name != 'workflow_dispatch'\n    runs-on: [self-hosted", "needs.plan.outputs.apply == 'true'\n    runs-on: [self-hosted"), 'gpu-smoke has no fork refusal')).toBe(true)
  })
  test('an unpinned action still fails, in the downloading step and in build-games', () => {
    expect(has(replaced(next(), `actions/download-artifact@${SHA} # v7.0.0`, 'actions/download-artifact@v7'), 'actions/download-artifact is not pinned')).toBe(true)
    expect(has(replaced(next(), `actions/upload-artifact@${SHA} # v7.0.2\n        with:\n          name: built-games`, 'actions/upload-artifact@v7\n        with:\n          name: built-games'), 'actions/upload-artifact is not pinned')).toBe(true)
  })
  test('gpu-smoke may need build-games and no other new job', () => {
    for (const other of ['fresh-agent-smooth', 'build', 'ledger', 'gpu']) {
      const t = replaced(next(), 'needs: [plan, pod-start, build-games]', `needs: [plan, pod-start, build-games, ${other}]`)
      expect(has(t, `gpu-smoke needs ${other}`)).toBe(true)
    }
    expect(has(replaced(next(), 'needs: [plan, pod-start, build-games]', 'needs: [plan, pod-start, fresh-agent-smooth]'), 'gpu-smoke needs fresh-agent-smooth')).toBe(true)
  })
  test('gpu-smoke needs written as a list is read too', () => {
    const t = replaced(next(), 'needs: [plan, pod-start, build-games]', 'needs:\n      - plan\n      - pod-start\n      - build-games')
    expect(gpuProblems(t)).toEqual([])
    expect(has(replaced(t, '      - build-games', '      - build-games\n      - fresh-agent-smooth'), 'gpu-smoke needs fresh-agent-smooth')).toBe(true)
  })
  test('the download is this run\'s artifact: no run id, no token, no other repository', () => {
    for (const [key, value] of [['run-id', '12345'], ['github-token', '${{ github.token }}'], ['repository', 'someone/else']]) {
      const t = replaced(next(), '          name: built-games\n          path: ${{ runner.temp }}/built\n', `          name: built-games\n          path: \${{ runner.temp }}/built\n          ${key}: ${value}\n`)
      expect(has(t, `gpu-smoke downloads an artifact with ${key}`)).toBe(true)
    }
  })
  test('gpu-smoke still reads only the three outputs, and none from build-games', () => {
    const t = replaced(next(), '      - name: Draw with WebGL on the GPU\n', '      - name: Draw with WebGL on the GPU\n        if: ${{ needs.build-games.outputs.token }}\n')
    expect(has(t, 'gpu-smoke reads needs.build-games.outputs.token')).toBe(true)
  })
  test('build-games runs on GitHub\'s runners and names no secret or variable', () => {
    expect(has(replaced(next(), '    runs-on: ubuntu-latest\n    timeout-minutes: 20', '    runs-on: [self-hosted, x]\n    timeout-minutes: 20'), 'build-games does not run on a GitHub runner')).toBe(true)
    expect(has(replaced(next(), /(  build-games:[\s\S]*?permissions:\n      contents: read\n)/, '$1    env:\n      K: ${{ secrets.RUNPOD_API_KEY }}\n'), 'build-games reads a secret or a variable')).toBe(true)
    expect(has(replaced(next(), /(  build-games:[\s\S]*?permissions:\n      contents: read\n)/, '$1    env:\n      K: ${{ vars.EXAMPLES_CI_APP_ID }}\n'), 'build-games reads a secret or a variable')).toBe(true)
  })
  test('build-games has a time limit', () => {
    expect(has(replaced(next(), '    timeout-minutes: 20\n    permissions:\n      contents: read\n', '    permissions:\n      contents: read\n'), 'job build-games has no timeout-minutes')).toBe(true)
  })
  test('an upload keeps 1 to 3 days, never longer and never forever', () => {
    expect(has(replaced(next(), 'retention-days: 1\n', 'retention-days: 4\n'), 'an upload without `retention-days: 3`')).toBe(true)
    expect(has(replaced(next(), 'retention-days: 1\n', ''), 'an upload without `retention-days: 3`')).toBe(true)
    expect(gpuProblems(replaced(next(), 'retention-days: 1\n', 'retention-days: 3\n'))).toEqual([])
  })
  test('the new smoke job is still the one that asks for its own pod label', () => {
    expect(smokeJob(next())).toContain("runs-on: [self-hosted, '${{ needs.pod-start.outputs.label }}']")
  })
})
