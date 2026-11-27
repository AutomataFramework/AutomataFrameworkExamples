import { describe, expect, test } from 'bun:test'
import { findProblems, isContent, NOTICE, NOTICE_WORDS } from '../../scripts/check-content-license.ts'

const notice = (): string => `# Content licence\n\nCopyright (c) 2026 McThayDT. ${NOTICE_WORDS}.\n`

describe('what counts as content', () => {
  test('pictures, sound, models and fonts, by their ending', () => {
    for (const path of ['a/hero.PNG', 'b/jump.ogg', 'c/room.glb', 'd/pixel.woff2', 'e/theme.mp3']) {
      expect(isContent(path)).toBe(true)
    }
  })
  test('anything in a story or content folder', () => {
    expect(isContent('games/2d/story/chapter-1.json')).toBe(true)
    expect(isContent('games/2d/content/menu.json')).toBe(true)
  })
  test('code and docs are not content', () => {
    for (const path of ['games/2d/src/main.ts', 'README.md', 'scripts/check.ts', 'package.json']) {
      expect(isContent(path)).toBe(false)
    }
  })
})

describe('the rule', () => {
  test('content under a folder with the notice passes', () => {
    const paths = [`games/${NOTICE}`, 'games/2d/art/hero.png', 'games/3d/story/intro.json']
    expect(findProblems(paths, notice)).toEqual([])
  })
  test('content outside it fails, naming the file', () => {
    const problems = findProblems([`games/${NOTICE}`, 'examples/hello/hero.png'], notice)
    expect(problems).toHaveLength(1)
    expect(problems[0]?.path).toBe('examples/hello/hero.png')
  })
  test('a notice at the root does not count, since the MIT code lives there', () => {
    const problems = findProblems([NOTICE, 'hero.png'], notice)
    expect(problems.map((p) => p.path)).toEqual([NOTICE, 'hero.png'])
  })
  test('a notice without the words fails', () => {
    const problems = findProblems([`games/${NOTICE}`, 'games/a.png'], () => 'MIT licence')
    expect(problems).toEqual([{ path: `games/${NOTICE}`, what: `this notice does not say "${NOTICE_WORDS}"` }])
  })
})
