// The pod's job-started hook (ci/gpu-image/job-started.sh) is run as the runner runs it: with the job's environment.
// A pod takes only the one job it was started for; anything else exits non-zero and writes no flag.
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, test } from 'bun:test'

const HOOK = new URL('../../ci/gpu-image/job-started.sh', import.meta.url).pathname
const REPO = 'AutomataFramework/AutomataFrameworkExamples'

function run(env: Record<string, string>, head = REPO): { code: number | null; flag: boolean } {
  const dir = mkdtempSync(join(tmpdir(), 'ax-hook-'))
  writeFileSync(join(dir, 'expect.env'), `AX_REPO=${REPO}\nAX_RUN_ID=77\n`)
  writeFileSync(join(dir, 'event.json'), JSON.stringify({ pull_request: { head: { repo: { full_name: head } } } }))
  const r = spawnSync('bash', [HOOK], {
    env: {
      PATH: process.env.PATH ?? '',
      AX_EXPECT_FILE: join(dir, 'expect.env'),
      AX_FLAG_FILE: join(dir, 'flag'),
      GITHUB_EVENT_PATH: join(dir, 'event.json'),
      GITHUB_REPOSITORY: REPO,
      GITHUB_RUN_ID: '77',
      GITHUB_WORKFLOW_REF: `${REPO}/.github/workflows/gpu.yml@refs/pull/3/merge`,
      GITHUB_JOB: 'gpu-smoke',
      GITHUB_EVENT_NAME: 'pull_request',
      ...env,
    },
    encoding: 'utf8',
  })
  return { code: r.status, flag: existsSync(join(dir, 'flag')) }
}

describe('the pod job-started hook', () => {
  test('takes the one job it was started for and writes its flag', () => {
    expect(run({})).toEqual({ code: 0, flag: true })
  })
  test('refuses another run, another job, another workflow and another repository', () => {
    expect(run({ GITHUB_RUN_ID: '78' })).toEqual({ code: 1, flag: false })
    expect(run({ GITHUB_JOB: 'plan' })).toEqual({ code: 1, flag: false })
    expect(run({ GITHUB_WORKFLOW_REF: `${REPO}/.github/workflows/ci.yml@refs/heads/main` })).toEqual({ code: 1, flag: false })
    expect(run({ GITHUB_REPOSITORY: 'someone/else' })).toEqual({ code: 1, flag: false })
  })
  test('refuses a pull request whose head is a fork', () => {
    expect(run({}, 'someone/AutomataFrameworkExamples')).toEqual({ code: 1, flag: false })
  })
})
