// The harness. `node harness/run.ts check` checks every game, `build` builds them, and with no command it plays every
// case (or `--piece <n>`, or `--case <id>`). CI builds on a GitHub runner, then runs the cases on a GPU pod.
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, rmSync } from 'node:fs'
import { delimiter, join } from 'node:path'
import { type Case, loadCases } from './cases.ts'
import { smallExamples, writePage } from './examples.ts'
import { piece, pieceProblems } from './pieces.ts'
import { address, launch, openGame, renderer, serve } from './ready.ts'

const repo = join(import.meta.dirname, '..')
const bin = join(repo, 'node_modules/.bin')

/** Runs a command from the repo's own tools, saying it first, and stops the harness if it fails. */
const sh = (cwd: string, command: string, ...args: string[]): void => {
  console.log(`$ ${command} ${args.join(' ')}   (in ${cwd.slice(repo.length + 1) || '.'})`)
  execFileSync(command, args, {
    cwd,
    stdio: 'inherit',
    env: { ...process.env, PATH: `${bin}${delimiter}${process.env['PATH'] ?? ''}` },
  })
}

/**
 * The game a newcomer gets, made fresh by the pinned `create-automata` into `examples/starter/` (never committed). It
 * needs no install of its own: its packages resolve from the repo's, which are pinned to the same version.
 */
function makeStarter(): string {
  const examples = join(repo, 'examples')
  const folder = join(examples, 'starter')
  rmSync(folder, { recursive: true, force: true })
  mkdirSync(examples, { recursive: true })
  sh(examples, 'create-automata', 'starter')
  return folder
}

/** Every game the harness checks and builds. Later slices add the samples here. */
const games = (): string[] => [makeStarter()]

/** Builds each small example (`examples/<group>/<name>/`) into `examples/<group>-<name>/dist`. */
function buildSmallExamples(): void {
  for (const example of smallExamples()) {
    writePage(example)
    sh(example.source, 'vite', 'build', '--base', './', '--outDir', join(example.built, 'dist'), '--emptyOutDir')
  }
}

async function play(selected: Case[]): Promise<boolean> {
  const browser = selected.some((c) => c.kind === 'page') ? await launch() : null
  let passed = 0
  try {
    for (const c of selected) {
      const started = performance.now()
      const where = c.kind === 'page' ? ` (${c.profile})` : ''
      try {
        if (c.kind === 'node') await c.run()
        else {
          const dist = join(repo, c.game, 'dist')
          if (!existsSync(dist)) throw new Error(`${c.game}/dist is not there. Run pnpm build:games first.`)
          const server = await serve(dist)
          try {
            // oxlint-disable-next-line no-await-in-loop -- one case at a time, so cases never starve each other
            const page = await openGame(browser!, `${address(server)}/`, c.profile)
            console.log(`  drawn by: ${await renderer(page)}`)
            await c.run(page)
            await page.context().close()
          } finally {
            server.close()
          }
        }
        passed++
        console.log(`✓ ${c.id}${where} in ${((performance.now() - started) / 1000).toFixed(1)} s: ${c.check}`)
      } catch (error) {
        console.log(`✗ ${c.id}${where}: ${c.check}\n  ${error instanceof Error ? error.message : String(error)}`)
      }
    }
  } finally {
    await browser?.close()
  }
  console.log(`${passed} of ${selected.length} cases passed.`)
  return passed === selected.length
}

async function main(args: string[]): Promise<number> {
  const [command] = args
  if (command === 'check') {
    for (const game of games()) sh(game, 'automata', 'check')
    return 0
  }
  if (command === 'build') {
    for (const game of games()) sh(game, 'vite', 'build')
    buildSmallExamples()
    return 0
  }
  const all = await loadCases()
  const problems = pieceProblems(all.map((c) => c.id))
  if (problems.length > 0) {
    console.log(problems.join('\n'))
    return 1
  }
  const flag = (name: string): string | undefined => {
    const i = args.indexOf(name)
    return i === -1 ? undefined : args[i + 1]
  }
  const pieceNumber = flag('--piece')
  const caseId = flag('--case')
  const wanted = caseId ? [caseId] : pieceNumber ? piece(Number(pieceNumber)) : all.map((c) => c.id)
  const selected = all.filter((c) => wanted.includes(c.id))
  // An empty run proves nothing, so it fails.
  if (selected.length === 0) {
    console.log(`No case matches ${caseId ?? `piece ${pieceNumber}`}.`)
    return 1
  }
  return (await play(selected)) ? 0 : 1
}

process.exitCode = await main(process.argv.slice(2))
