// GitHub: the repo's own App (installed on this repo only), asked for the least it can do, and the calls the gate makes.
import { createSign } from 'node:crypto'
import { caller, ok, type Call, type Fetch, type Retries } from './http.ts'

export const GITHUB = 'https://api.github.com'
const HEADERS = { 'x-github-api-version': '2022-11-28' }

/** What the gate asks of the App: runners (administration) and, for the ledger, repository variables. Nothing else. */
export const APP_PERMISSIONS = { administration: 'write', actions_variables: 'write' } as const

const b64url = (b: Buffer | string): string => Buffer.from(b).toString('base64url')

/** A GitHub App JWT (RS256), backdated a minute for clock drift and valid for nine. */
export function appJwt(appId: string, pem: string, nowMs: number): string {
  const iat = Math.floor(nowMs / 1000) - 60
  const head = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const claims = b64url(JSON.stringify({ iat, exp: iat + 540, iss: appId }))
  const sig = createSign('RSA-SHA256').update(`${head}.${claims}`).sign(pem)
  return `${head}.${claims}.${b64url(sig)}`
}

/** A caller for one repository with a one-hour installation token limited to `repositories: [that repo]`. */
export async function installationCaller(
  fetchFn: Fetch,
  appId: string,
  pem: string,
  repo: string,
  nowMs: number,
  retries?: Retries,
): Promise<{ call: Call; token: string }> {
  const jwt = appJwt(appId, pem, nowMs)
  const app = caller(fetchFn, GITHUB, () => `Bearer ${jwt}`, retries, HEADERS)
  const install = ok('GET installation', await app<{ id: number }>('GET', `/repos/${repo}/installation`))
  const { token } = ok(
    'POST access_tokens',
    await app<{ token: string }>('POST', `/app/installations/${install.id}/access_tokens`, {
      repositories: [repo.split('/')[1]],
      permissions: APP_PERMISSIONS,
    }),
  )
  return { call: caller(fetchFn, GITHUB, () => `Bearer ${token}`, retries, HEADERS), token }
}

export function githubCaller(fetchFn: Fetch, token: string, retries?: Retries): Call {
  return caller(fetchFn, GITHUB, () => `Bearer ${token}`, retries, HEADERS)
}

/** The labels GitHub puts on every self-hosted runner. Any other label that was not asked for is refused. */
const DEFAULT_LABELS = ['self-hosted', 'Linux', 'X64', 'ARM64']

export type Runner = { id: number; name: string; status: string; labels?: { name: string }[] }

/**
 * A just-in-time runner config with one custom label: the run's own (a replacement pod keeps the first pod's label,
 * so the job finds it). GitHub adds `self-hosted` and others by default;
 * the call is refused here when it does, because any job could then take the runner.
 */
export async function makeJit(gh: Call, repo: string, name: string, label: string): Promise<{ jit: string; runnerId: number }> {
  const r = ok(
    'POST generate-jitconfig',
    await gh<{ runner: Runner; encoded_jit_config: string }>('POST', `/repos/${repo}/actions/runners/generate-jitconfig`, {
      name,
      labels: [label],
      runner_group_id: 1,
      work_folder: '_work',
    }),
  )
  const extra = (r.runner.labels ?? []).map((l) => l.name).filter((l) => l !== label && !DEFAULT_LABELS.includes(l))
  if (extra.length) {
    await gh('DELETE', `/repos/${repo}/actions/runners/${r.runner.id}`).catch(() => undefined)
    throw new Error(`GitHub gave runner ${name} labels it was not asked for: ${extra.join(' ')}`)
  }
  return { jit: r.encoded_jit_config, runnerId: r.runner.id }
}

export async function runnerOnline(gh: Call, repo: string, name: string): Promise<boolean> {
  const r = ok('GET runners', await gh<{ runners: Runner[] }>('GET', `/repos/${repo}/actions/runners?per_page=100`))
  return r.runners.some((x) => x.name === name && x.status === 'online')
}

export async function deleteRunner(gh: Call, repo: string, name: string): Promise<void> {
  const r = ok('GET runners', await gh<{ runners: Runner[] }>('GET', `/repos/${repo}/actions/runners?per_page=100`))
  for (const x of r.runners.filter((x) => x.name === name)) {
    await gh('DELETE', `/repos/${repo}/actions/runners/${x.id}`).catch(() => undefined)
  }
}

export type Job = { name: string; status: string; conclusion: string | null; runner_name?: string | null; started_at?: string | null }

export async function runJobs(gh: Call, repo: string, runId: string, attempt: string): Promise<Job[]> {
  const r = ok(
    'GET jobs',
    await gh<{ jobs: Job[] }>('GET', `/repos/${repo}/actions/runs/${runId}/attempts/${attempt}/jobs?per_page=100`),
  )
  return r.jobs
}

export async function cancelRun(gh: Call, repo: string, runId: string): Promise<void> {
  const r = await gh('POST', `/repos/${repo}/actions/runs/${runId}/cancel`)
  if (r.status >= 300 && r.status !== 409) throw new Error(`cancel run answered ${r.status}`)
}
