import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'bun:test'
import { loadCases } from '../../harness/cases.ts'
import { smallExamples } from '../../harness/examples.ts'

describe('the small examples', () => {
  test('there are four, each named for its folder in its automata.json', () => {
    const found = smallExamples()
    expect(found.map((e) => e.id)).toEqual(['core/open-a-window', 'input/move-by-gamepad', 'input/move-by-touch', 'shapes/draw-shapes'])
    for (const example of found) {
      const manifest = JSON.parse(readFileSync(join(example.source, 'public', 'automata.json'), 'utf8')) as { id: string }
      expect(manifest.id).toBe(example.id.split('/')[1] ?? '')
    }
  })

  test('every example is played by a case', async () => {
    const played = new Set((await loadCases()).flatMap((c) => (c.kind === 'page' ? [c.game] : [])))
    for (const example of smallExamples())
      expect(played.has(`examples/${example.id.replace('/', '-')}`)).toBe(true)
  })

  test('each example is one file of plain functions, short: under 60 lines', () => {
    for (const example of smallExamples())
      expect(readFileSync(join(example.source, 'main.ts'), 'utf8').split('\n').length).toBeLessThan(60)
  })
})
