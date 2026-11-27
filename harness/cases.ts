// A case is one thing the harness proves. Each slice adds its own files under `cases/<slice>/`, each exporting
// `cases`; nothing else changes when a slice adds one.
import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import type { Page } from 'playwright-core'
import type { ProfileName } from './profiles.ts'

type Base = {
  /** `<slice>/<name>`, unique. */
  id: string
  slice: string
  /** What the case proves, in one plain sentence. */
  check: string
}

/** Opens a built game (`<game>/dist`) in a profile, then plays it. */
type PageCase = Base & { kind: 'page'; game: string; profile: ProfileName; run(page: Page): Promise<void> }

/** Runs in Node with no browser. */
type NodeCase = Base & { kind: 'node'; run(): Promise<void> }

export type Case = PageCase | NodeCase

const here = import.meta.dirname

/** Every case under `harness/cases/`, sorted by id. Throws on a case whose id or slice does not match its folder. */
export async function loadCases(root = join(here, 'cases')): Promise<Case[]> {
  const found: Case[] = []
  for (const slice of readdirSync(root).toSorted())
    for (const file of readdirSync(join(root, slice)).filter((f) => f.endsWith('.ts')).toSorted()) {
      const { cases } = (await import(join(root, slice, file))) as { cases: Case[] }
      for (const c of cases) {
        if (c.slice !== slice || !c.id.startsWith(`${slice}/`))
          throw new Error(`${slice}/${file}: case ${c.id} must be in slice ${slice} and named ${slice}/<name>`)
        found.push(c)
      }
    }
  const ids = found.map((c) => c.id)
  const twice = ids.filter((id, i) => ids.indexOf(id) !== i)
  if (twice.length > 0) throw new Error(`These case ids are used twice: ${twice.join(', ')}`)
  return found.toSorted((a, b) => a.id.localeCompare(b.id))
}
