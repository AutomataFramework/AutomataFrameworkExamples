// What every CLI reads: the run it belongs to, the keys it was given, and the real fetch. Keys come from the step's
// own `env`, never from a file in the change.
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { githubVars } from '../budget.ts'
import type { Deps } from '../gate.ts'
import { installationCaller } from '../github.ts'
import type { Event } from '../runpod.ts'
import { runpod } from '../runpod.ts'
import type { Retries } from '../http.ts'

export function need(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`${name} is not set`)
  return v
}

export const fetchFn = globalThis.fetch as unknown as import('../http.ts').Fetch

export function setOutput(name: string, value: string): void {
  if (/[\r\n]/.test(value)) throw new Error(`output ${name} has a newline`)
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${value}\n`)
  else console.log(`output ${name}=${value}`)
}

/** Scratch files for passing a secret between steps: the runner's temp folder, mode 0600, gone with the job. */
export function scratch(name: string): string {
  const dir = join(process.env.RUNNER_TEMP ?? '/tmp', 'ax-gpu')
  mkdirSync(dir, { recursive: true, mode: 0o700 })
  return join(dir, name)
}
export function writeScratch(name: string, value: string): void {
  writeFileSync(scratch(name), value, { mode: 0o600 })
}
export function readScratch(name: string): string {
  return readFileSync(scratch(name), 'utf8')
}

export function addSummary(markdown: string): void {
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, markdown)
  else console.log(markdown)
}

export async function deps(): Promise<{ d: Deps; retries: Retries; events: Event[] }> {
  const retries: Retries = new Map()
  const events: Event[] = []
  const repo = need('GITHUB_REPOSITORY')
  const now = Date.now()
  const { call: gh } = await installationCaller(fetchFn, need('APP_ID'), need('APP_KEY'), repo, now, retries)
  const d: Deps = {
    rp: runpod(fetchFn, need('RUNPOD_API_KEY'), retries),
    gh,
    vars: githubVars(gh, repo),
    repo,
    image: process.env.GPU_IMAGE ?? '',
    now: () => Date.now(),
    sleep: (ms) => new Promise((done) => setTimeout(done, ms)),
    events,
  }
  return { d, retries, events }
}
