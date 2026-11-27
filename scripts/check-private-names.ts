// Fails when a private name (the sample games' real names, and anything else the Owner keeps private) appears
// anywhere this public repo shows: a file's words, a file's path, a commit message, a pull request's title or
// description, or a branch name.
//
// Why: the samples go public under the code names "2D sample" and "3D sample", and their real names stay private
// until the Owner says otherwise (roadmap, section 9). The names themselves are never written here: they come from the
// `PRIVATE_NAMES` secret, a comma-separated list, and this script never prints one. A finding says where, and which
// entry of the list (by its number) matched.
//
// It only reads. In CI it runs from `main`'s copy against the pull request's files as plain data, so a pull request
// from a fork never gets the secret into code it wrote. `--self-test` plants the first name in a throwaway git repo
// (in a file, in a prompt file, in a commit message, in a description and in a branch name) and fails unless every
// plant is found, so a run proves the secret is read and matched without the name ever reaching a public page.
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Lower case, accents dropped, and everything but letters and digits taken out, so spacing and case do not hide a name. */
export function squash(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '')
}

/** The names from the secret's text: comma or newline separated, trimmed, empty entries dropped. */
export function parseNames(raw: string | undefined): string[] {
  return (raw ?? '')
    .split(/[,\n]/)
    .map((name) => name.trim())
    .filter((name) => squash(name).length > 0)
}

/**
 * The numbers (from 1) of the names found in `text`. A name of five letters or more is found even when its words are
 * run together or split differently; a shorter one only as a whole word, so it does not match inside other words.
 */
export function namesIn(text: string, names: readonly string[]): number[] {
  const flat = squash(text)
  const words = ` ${text.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ')} `
  const found: number[] = []
  names.forEach((name, i) => {
    const key = squash(name)
    const hit = key.length >= 5 ? flat.includes(key) : words.includes(` ${name.toLowerCase().trim()} `)
    if (hit) found.push(i + 1)
  })
  return found
}

/** One place a name was found. `where` never holds the name itself. */
export interface Finding {
  where: string
  name: number
}

/** One piece of text to look in, with where it is from. */
export interface Source {
  where: string
  text: string
}

/** Every finding in `sources`. A file's text is looked at line by line, so a finding names its line. */
export function scan(sources: readonly Source[], names: readonly string[]): Finding[] {
  const findings: Finding[] = []
  for (const source of sources) {
    const lines = source.text.split('\n')
    lines.forEach((line, i) => {
      for (const name of namesIn(line, names)) {
        findings.push({ where: lines.length > 1 ? `${source.where}, line ${i + 1}` : source.where, name })
      }
    })
    // A name split across two lines of a description or a message is still found.
    if (lines.length > 1) {
      const lineHits = new Set(findings.filter((f) => f.where.startsWith(source.where)).map((f) => f.name))
      for (const name of namesIn(source.text, names)) {
        if (!lineHits.has(name)) findings.push({ where: `${source.where} (across lines)`, name })
      }
    }
  }
  return findings
}

/** Every file under `dir` (its `.git` and `node_modules` left out), as a path and its text, plus the path itself. */
export function filesOf(dir: string): Source[] {
  const sources: Source[] = []
  const walk = (folder: string): void => {
    for (const entry of readdirSync(folder)) {
      if (entry === '.git' || entry === 'node_modules') continue
      const path = join(folder, entry)
      const rel = relative(dir, path)
      sources.push({ where: `the path ${rel}`, text: rel })
      const stat = statSync(path)
      if (stat.isDirectory()) walk(path)
      else if (stat.isFile()) sources.push({ where: rel, text: readFileSync(path).toString('utf8') })
    }
  }
  walk(dir)
  return sources
}

/** The messages of the commits in `range` (such as `base..head`) of the git repo at `dir`. */
export function commitsOf(dir: string, range: string): Source[] {
  const out = execFileSync('git', ['log', '--format=%H%x00%B%x01', range], { cwd: dir, encoding: 'utf8' })
  return out
    .split('\x01')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [sha, message] = entry.split('\0')
      return { where: `the message of commit ${(sha ?? '').slice(0, 7)}`, text: message ?? '' }
    })
}

/** The text a person reads when the check fails. Names stay out of it. */
export function explain(findings: readonly Finding[]): string {
  return [
    'A private name is in this change. Take it out before this can go in:',
    '',
    ...findings.map((f) => `  - ${f.where}: private name number ${f.name} of the PRIVATE_NAMES list`),
    '',
    'Write "2D sample" or "3D sample" instead. A name in a commit message needs that commit reworded; a name in the',
    'title or description is fixed by editing it on GitHub, and this check runs again by itself.',
  ].join('\n')
}

/** Plants the first name everywhere this check looks, in a throwaway repo, and returns the plants it missed. */
export function selfTest(names: readonly string[]): string[] {
  const name = names[0]
  if (name === undefined) return ['there is no name to plant']
  const dir = mkdtempSync(join(tmpdir(), 'private-names-'))
  try {
    const git = (...args: string[]): string =>
      execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.com', ...args], {
        cwd: dir,
        encoding: 'utf8',
      })
    git('init', '-q', '-b', 'main')
    writeFileSync(join(dir, 'README.md'), 'Nothing private here.\n')
    git('add', '.')
    git('commit', '-q', '-m', 'A clean start')
    const base = git('rev-parse', 'HEAD').trim()
    writeFileSync(join(dir, 'notes.txt'), `Some words, then ${name.toUpperCase()}, then more.\n`)
    writeFileSync(join(dir, 'AGENTS.md'), `# Prompt\n\nMake a game called ${name} with a menu.\n`)
    git('add', '.')
    git('commit', '-q', '-m', `Add the menu\n\nFor ${name}.`)
    const files = filesOf(dir)
    const commits = commitsOf(dir, `${base}..HEAD`)
    const plants: [string, Source[]][] = [
      ['a file', files.filter((s) => s.where.startsWith('notes.txt'))],
      ['a prompt', files.filter((s) => s.where.startsWith('AGENTS.md'))],
      ['a commit message', commits],
      ['a pull request description', [{ where: 'the description', text: `Adds\nthe ${name} menu.` }]],
      ['a branch name', [{ where: 'the branch', text: `feature/${squash(name)}-menu` }]],
    ]
    const missed = plants.filter(([, sources]) => scan(sources, [name]).length === 0).map(([what]) => what)
    if (scan([{ where: 'clean', text: 'Nothing private here.' }], [name]).length > 0) missed.push('a clean text')
    return missed
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

/** Reads the names and what to look at from the command line and the environment, and fails on any finding. */
function main(): void {
  const names = parseNames(process.env.PRIVATE_NAMES)
  if (names.length === 0) {
    console.error(
      'The PRIVATE_NAMES secret is empty or missing, so nothing can be checked. The Owner sets it once with:\n' +
        '  gh secret set PRIVATE_NAMES -R AutomataFramework/AutomataFrameworkExamples',
    )
    process.exitCode = 1
    return
  }
  const args = process.argv.slice(2)
  if (args[0] === '--self-test') {
    const missed = selfTest(names)
    if (missed.length > 0) {
      console.error(`The self-test planted the first private name and did not find it in: ${missed.join(', ')}.`)
      process.exitCode = 1
      return
    }
    console.log(`Self-test: the first of ${names.length} private names was found in every place it was planted.`)
    return
  }
  const dir = args[0] ?? '.'
  const range = args[1]
  const sources = filesOf(dir)
  if (range !== undefined && range !== '') sources.push(...commitsOf(dir, range))
  for (const [where, value] of [
    ['the pull request title', process.env.PR_TITLE],
    ['the pull request description', process.env.PR_BODY],
    ['the branch name', process.env.BRANCH],
  ] as const) {
    if (value) sources.push({ where, text: value })
  }
  const findings = scan(sources, names)
  if (findings.length === 0) {
    console.log(`No private name in ${sources.length} places looked at (${names.length} names).`)
    return
  }
  console.error(explain(findings))
  process.exitCode = 1
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main()
