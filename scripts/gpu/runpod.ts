// RunPod's REST API (v2), measured 2026-11-27 from a GitHub runner: `https://api.runpod.io/v2`, bearer key.
// The repo's key can read and write pods; it cannot read billing or the GPU catalog, so neither is used here.
import { CLOUD, FALLBACK_COST_PER_HR, GPU_ORDER, isGpuName } from './config.ts'
import { caller, ok, type Call, type Fetch, type Retries } from './http.ts'

export const RUNPOD = 'https://api.runpod.io'

export type Pod = { id: string; name: string; cost?: number; createdAt?: string; status?: string }

export function runpod(fetchFn: Fetch, key: string, retries?: Retries): Call {
  return caller(fetchFn, RUNPOD, () => `Bearer ${key}`, retries)
}

/** Every pod on the account, page by page. Callers filter by name; this never decides what is ours. */
export async function allPods(rp: Call): Promise<Pod[]> {
  const pods: Pod[] = []
  let cursor: string | null = null
  do {
    const query: string = `?limit=1000${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`
    const page: { pods: Pod[]; pagination?: { nextCursor: string | null; hasNextPage: boolean } } = ok(
      'GET /v2/pods',
      await rp('GET', `/v2/pods${query}`),
    )
    pods.push(...page.pods)
    cursor = page.pagination?.hasNextPage ? page.pagination.nextCursor : null
  } while (cursor)
  return pods
}

export type Made = { pod: Pod; gpu: string; priced: boolean; costPerHr: number }
export type Event = { kind: 'fallback' | 'replaced' | 'note' | 'retry'; text: string }

export type CreateSpec = {
  name: string
  image: string
  env: Record<string, string>
  diskGb: number
}

/**
 * Tries each card in `GPU_ORDER`, cheapest first, and falls to the next on any refusal that is about the card
 * (no stock, an unknown id). A refusal about the key or the money (401, 402, 403) stops at once: no other card helps.
 * Every fall-back is returned as an event for the summary.
 */
export async function createPod(
  rp: Call,
  spec: CreateSpec,
  events: Event[],
  order: readonly string[] = GPU_ORDER,
): Promise<Made> {
  const refusals: string[] = []
  for (const gpu of order) {
    if (!isGpuName(gpu)) throw new Error(`not an NVIDIA card name: ${gpu}`)
    const r = await rp<Pod & { cost?: number }>('POST', '/v2/pods', {
      name: spec.name,
      image: spec.image,
      cloud: CLOUD,
      gpu: { id: gpu, count: 1 },
      disk: spec.diskGb,
      env: spec.env,
    })
    if (r.status === 200 || r.status === 201) {
      const priced = typeof r.body.cost === 'number' && r.body.cost > 0
      return { pod: r.body, gpu, priced, costPerHr: priced ? (r.body.cost as number) : FALLBACK_COST_PER_HR }
    }
    // Never log a create body: it carries the runner config. The answer RunPod gives is its own text.
    const why = `${gpu}: ${r.status} ${JSON.stringify(r.body).slice(0, 160)}`
    refusals.push(why)
    if (r.status === 401 || r.status === 402 || r.status === 403) break
    events.push({ kind: 'fallback', text: `no ${gpu} (${r.status}), trying the next card` })
  }
  throw new Error(`no pod could be made: ${refusals.join('; ')}`)
}

/** Deletes one pod by id. 404 means it is already gone, which is the goal. */
export async function deletePod(rp: Call, id: string): Promise<boolean> {
  const r = await rp('DELETE', `/v2/pods/${id}`)
  return (r.status >= 200 && r.status < 300) || r.status === 404
}
