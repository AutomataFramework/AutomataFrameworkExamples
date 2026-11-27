import { describe, expect, test } from 'bun:test'
import { explain, namesIn, parseNames, scan, selfTest, squash } from '../../scripts/check-private-names.ts'

// Made-up names, so this public test never holds a real one.
const NAMES = ['Quiet Heron', 'Moss', 'Zebrafjord']

describe('reading the list', () => {
  test('commas and new lines split it, and blanks are dropped', () => {
    expect(parseNames(' Quiet Heron, Moss ,,\nZebrafjord\n')).toEqual(NAMES)
  })
  test('a missing secret is an empty list', () => {
    expect(parseNames(undefined)).toEqual([])
  })
  test('squash drops case, accents, spaces and marks', () => {
    expect(squash('Qúiet-HERON!')).toBe('quietheron')
  })
})

describe('finding a name', () => {
  test('in any case, spacing or punctuation', () => {
    for (const text of ['the quiet heron', 'QuietHeron', 'quiet_heron', 'quiet-heron.png', 'QUIET  HERON']) {
      expect(namesIn(text, NAMES)).toEqual([1])
    }
  })
  test('with accents added', () => {
    expect(namesIn('Zébrafjörd', NAMES)).toEqual([3])
  })
  test('a short name only as a whole word', () => {
    expect(namesIn('a mossy rock', NAMES)).toEqual([])
    expect(namesIn('the Moss level', NAMES)).toEqual([2])
  })
  test('clean text finds nothing', () => {
    expect(namesIn('The 2D sample has a menu.', NAMES)).toEqual([])
  })
})

describe('scanning', () => {
  test('a finding names the place and line, never the name', () => {
    const findings = scan([{ where: 'games/a/notes.txt', text: 'one\ntwo quiet heron\n' }], NAMES)
    expect(findings).toEqual([{ where: 'games/a/notes.txt, line 2', name: 1 }])
    const text = explain(findings)
    expect(text).toContain('games/a/notes.txt, line 2')
    expect(text.toLowerCase()).not.toContain('heron')
  })
  test('a name split across two lines is found', () => {
    expect(scan([{ where: 'the description', text: 'about the quiet\nheron' }], NAMES)).toEqual([
      { where: 'the description (across lines)', name: 1 },
    ])
  })
})

describe('the self-test', () => {
  test('finds the planted name in a file, a prompt, a commit message, a description and a branch', () => {
    expect(selfTest(NAMES)).toEqual([])
  })
  test('with no name it fails', () => {
    expect(selfTest([])).toEqual(['there is no name to plant'])
  })
})
