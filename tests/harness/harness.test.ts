import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, test } from 'bun:test'
import { loadCases } from '../../harness/cases.ts'
import { pieceProblems, pieces } from '../../harness/pieces.ts'
import { profiles } from '../../harness/profiles.ts'

describe('the harness', () => {
  test('every case sits in exactly one piece, and every piece names real cases', async () => {
    const ids = (await loadCases()).map((c) => c.id)
    expect(ids.length).toBeGreaterThan(0)
    expect(pieceProblems(ids)).toEqual([])
    expect(pieces.length).toBeLessThanOrEqual(3)
  })

  test('a case in no piece, in two, or a piece naming a missing case is caught', () => {
    expect(pieceProblems(['1a/a', '1a/b'], [['1a/a']])).toHaveLength(1)
    expect(pieceProblems(['1a/a'], [['1a/a'], ['1a/a']])).toHaveLength(1)
    expect(pieceProblems(['1a/a'], [['1a/a', '1a/gone']])).toHaveLength(1)
  })

  test('the three profiles are the sizes the plan names, with touch on the phone and tablet only', () => {
    expect(profiles.phone.viewport).toEqual({ width: 375, height: 667 })
    expect(profiles.tablet.viewport).toEqual({ width: 820, height: 1180 })
    expect(profiles.computer.viewport).toEqual({ width: 1440, height: 900 })
    expect([profiles.phone.hasTouch, profiles.tablet.hasTouch, profiles.computer.hasTouch]).toEqual([true, true, false])
  })

  // Each folder is new, because a module once imported stays cached under its path.
  const casesIn = (files: Record<string, string[]>): string => {
    const root = mkdtempSync(join(tmpdir(), 'cases-'))
    mkdirSync(join(root, '1a'))
    for (const [file, ids] of Object.entries(files))
      writeFileSync(
        join(root, '1a', file),
        `export const cases = ${JSON.stringify(ids.map((id) => ({ id, slice: '1a', check: 'x', kind: 'node' })))}`,
      )
    return root
  }

  test('a case named outside its slice folder stops the harness', async () => {
    await expect(loadCases(casesIn({ 'a.ts': ['1b/a'] }))).rejects.toThrow('must be in slice 1a')
  })

  test('an id used twice stops the harness', async () => {
    await expect(loadCases(casesIn({ 'a.ts': ['1a/a'], 'b.ts': ['1a/a'] }))).rejects.toThrow('used twice')
  })
})
