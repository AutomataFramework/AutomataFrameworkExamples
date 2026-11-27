import { describe, test } from 'node:test'
import { githubVars } from '../../scripts/gpu/budget.ts'
import { caller } from '../../scripts/gpu/http.ts'
import { preflight, type Preflight } from '../../scripts/gpu/preflight.ts'
import { expect } from '../expect.ts'
import { deps } from './fakes.ts'

function setup(overrides: Partial<Preflight> = {}) {
  const { d, w, fetchFn } = deps()
  // The stand-in's registry answers for the image check.
  const reg: typeof fetchFn = async (url, init) => {
    const r = (b: unknown) => ({ status: 200, text: async () => JSON.stringify(b) })
    if (url.startsWith('https://ghcr.io/token')) return r({ token: 't' })
    // ghcr measured 2026-11-27: no Accept header gives 404; the image is an index, so the platform's manifest is a second fetch.
    if (url.includes('/manifests/') && !String(init?.headers?.accept).includes('application/vnd.oci.image.index.v1+json')) return { status: 404, text: async () => '{}' }
    if (url.includes('/manifests/sha256:a')) return r({ manifests: [{ digest: 'sha256:11arm', platform: { os: 'linux', architecture: 'arm64' } }, { digest: 'sha256:11amd', platform: { os: 'linux', architecture: 'amd64' } }] })
    if (url.includes('/manifests/sha256:11amd')) return r({ config: { digest: 'sha256:c' } })
    if (url.includes('/blobs/')) return r({ config: { Labels: { 'org.automata.runner-version': '2.338.2' } } })
    if (url.includes('/repos/actions/runner/releases/tags/v2.338.2')) return r({ tag_name: 'v2.338.2', published_at: '2026-11-01T00:00:00Z' })
    if (url.includes('/repos/actions/runner/releases/latest')) return r({ tag_name: 'v2.340.0', published_at: '2026-11-20T00:00:00Z' })
    if (url.includes('AutomataFrameworkEditors')) return { status: 404, text: async () => '{}' }
    return fetchFn(url, init)
  }
  const gh = caller(reg, 'https://api.github.com', () => 't', new Map(), {}, async () => {})
  const p: Preflight = {
    rp: d.rp,
    gh,
    vars: githubVars(gh, d.repo),
    repo: d.repo,
    otherRepo: 'AutomataFramework/AutomataFrameworkEditors',
    fetchFn: reg,
    image: 'ghcr.io/automataframework/ci-gpu@sha256:' + 'a'.repeat(64),
    now: d.now(),
    lastSweep: d.now() - 30 * 60_000,
    ...overrides,
  }
  return { p, w }
}

describe('preflight', () => {
  test('passes with the right keys', async () => {
    const { p } = setup()
    const results = await preflight(p)
    expect(results.filter((r) => !r.ok)).toEqual([])
    expect(results.length > 5).toBe(true)
  })
  test('makes a runner config and removes its runner unused, and leaves no variable behind', async () => {
    const { p, w } = setup()
    await preflight(p)
    expect(w.runners).toHaveLength(0)
    expect(w.variables.size).toBe(0)
  })
  test('fails naming the call when RunPod refuses the key (a stand-in key)', async () => {
    const { p } = setup({ rp: caller(async () => ({ status: 403, text: async () => '{"detail":"this API key does not grant pods:read"}' }), 'https://api.runpod.io', () => 'x', new Map(), {}, async () => {}) })
    const failed = (await preflight(p)).filter((r) => !r.ok)
    expect(failed).toHaveLength(1)
    expect(failed[0].name).toBe('RunPod: GET /v2/pods')
    expect(failed[0].detail).toContain('403')
  })
  test('fails naming the call when the App cannot write variables', async () => {
    const { p } = setup()
    const base = p.gh
    p.gh = async (m, path, b) => (path.includes('/actions/variables') ? { status: 403, body: { message: 'Resource not accessible' } as never } : base(m, path, b))
    p.vars = githubVars(p.gh, p.repo)
    const failed = (await preflight(p)).filter((r) => !r.ok)
    expect(failed.map((f) => f.name)).toEqual(['GitHub: repository variables'])
    expect(failed[0].detail).toContain('403')
  })
  test('fails when the App can read Editors', async () => {
    const { p } = setup()
    const base = p.gh
    p.gh = async (m, path, b) => (path.includes('AutomataFrameworkEditors') ? { status: 200, body: {} as never } : base(m, path, b))
    expect((await preflight(p)).filter((r) => !r.ok).map((f) => f.name)).toEqual(['GitHub: the App cannot read Editors'])
  })
  test('warns (fails) when the sweep has not run for more than 2 hours, or never', async () => {
    const { p } = setup()
    expect((await preflight({ ...p, lastSweep: p.now - 3 * 3_600_000 })).filter((r) => !r.ok)[0].name).toBe('Sweep ran lately')
    expect((await preflight({ ...p, lastSweep: null })).filter((r) => !r.ok)[0].detail).toContain('never run')
    // a schedule GitHub has not yet started is given a day
    expect((await preflight({ ...p, lastSweep: null, workflowCreated: p.now - 3 * 3_600_000 })).filter((r) => !r.ok)).toEqual([])
    expect((await preflight({ ...p, lastSweep: null, workflowCreated: p.now - 30 * 3_600_000 })).filter((r) => !r.ok)[0].detail).toContain('never run')
    expect((await preflight({ ...p, lastSweep: p.now - 1.9 * 3_600_000 })).filter((r) => !r.ok)).toEqual([])
  })
  test('fails when the image runner is more than 30 days behind the latest release', async () => {
    const { p } = setup()
    const fetchFn = p.fetchFn
    p.fetchFn = async (url, init) => (url.includes('releases/latest') ? { status: 200, text: async () => JSON.stringify({ tag_name: 'v2.400.0', published_at: '2027-01-10T00:00:00Z' }) } : fetchFn(url, init))
    const base = p.gh
    p.gh = async (m, path, b) => (path.includes('releases/latest') ? { status: 200, body: { tag_name: 'v2.400.0', published_at: '2027-01-10T00:00:00Z' } as never } : base(m, path, b))
    const failed = (await preflight(p)).filter((r) => !r.ok)
    expect(failed[0].name).toBe('Pod image: runner version')
    expect(failed[0].detail).toContain('rebuild the image')
  })
  test('fails on an image that is not pinned by digest', async () => {
    const { p } = setup({ image: 'ghcr.io/automataframework/ci-gpu:latest' })
    expect((await preflight(p)).filter((r) => !r.ok)[0].detail).toContain('not pinned by digest')
  })
})
