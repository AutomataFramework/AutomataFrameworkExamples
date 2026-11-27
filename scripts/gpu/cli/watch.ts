// `watch`: if `gpu-smoke` has not started 3 minutes after the runner came online, say why and cancel the run, so
// `pod-stop` runs and the `gpu` check fails instead of waiting up to 24 hours. It holds no RunPod key.
import { githubVars } from '../budget.ts'
import { watchRun } from '../gate.ts'
import { GITHUB } from '../github.ts'
import { caller } from '../http.ts'
import { addSummary, fetchFn, need } from './env.ts'

const repo = need('GITHUB_REPOSITORY')
const gh = caller(fetchFn, GITHUB, () => `Bearer ${need('GITHUB_TOKEN')}`, new Map(), { 'x-github-api-version': '2022-11-28' })
const d = {
  rp: gh,
  gh,
  vars: githubVars(gh, repo),
  repo,
  image: '',
  now: () => Date.now(),
  sleep: (ms: number) => new Promise<void>((done) => setTimeout(done, ms)),
  events: [],
}
const state = await watchRun(d, need('GITHUB_RUN_ID'), need('GITHUB_RUN_ATTEMPT'), (line) => {
  addSummary(`**${line}**\n`)
  console.log(`::error::${line}`)
})
console.log(`gpu-smoke: ${state}`)
