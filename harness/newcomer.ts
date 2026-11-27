// Criterion 20: a newcomer's whole path, from outside this repo. In a temp folder: `npm create automata@preview`,
// install, check, build, `npm run link`, then open the link on a small phone and play to the win.
//
// The link needs a real test repo (`AutomataFramework/newcomer-check`, card O7). Until it exists, `link` talks to a
// stand-in for GitHub made here, and this check says so: criterion 20 is not met by a stand-in run.
import { execFile, execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { type Server, type ServerResponse, createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { touchToWin } from './cases/1a/starter.ts'
import { address, files, launch, openGame } from './ready.ts'

const say = (line: string): void => console.log(line)

/** Runs a command the way a newcomer would type it, and shows what it printed. */
function run(cwd: string, command: string, args: string[], env: NodeJS.ProcessEnv = {}): string {
  say(`$ ${command} ${args.join(' ')}`)
  const out = execFileSync(command, args, { cwd, env: { ...process.env, ...env }, encoding: 'utf8' })
  if (out.trim()) say(out.trim())
  return out
}

// Only the stand-in accepts this, and only from this process.
const standInToken = 'standin-token-for-the-newcomer-check-only'

const reply = (response: ServerResponse, status: number, value: unknown): void =>
  void response.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(value))

/**
 * A stand-in for GitHub: the four API calls `link` makes, bare repos in a folder, and Pages. Real Pages builds the
 * pushed files with the game's own workflow; the stand-in serves the folder that `npm run build` made, and answers
 * `build.json` with the pushed commit, which is what `link` waits for.
 */
async function standInGithub(bareRoot: string, built: string): Promise<{ server: Server; calls: string[] }> {
  const calls: string[] = []
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://x')
    let body = ''
    request.on('data', (chunk: Buffer) => (body += chunk.toString()))
    request.on('end', () => {
      const [, area, owner, name, ...rest] = url.pathname.split('/')
      if (area === 'pages') {
        const bare = join(bareRoot, `${owner}/${name}.git`)
        if (!existsSync(bare)) return reply(response, 404, {})
        if (rest.join('/') === 'build.json') {
          const commit = execFileSync('git', ['rev-parse', 'main'], { cwd: bare, encoding: 'utf8' }).trim()
          return reply(response, 200, { commit })
        }
        // Everything else on the link comes from the built game, under the same path Pages serves it at.
        return files(built, `/pages/${owner}/${name}/`)(request, response)
      }
      calls.push(`${request.method} ${url.pathname}`)
      if (request.headers.authorization !== `Bearer ${standInToken}`) return reply(response, 401, {})
      if (request.method === 'GET' && url.pathname === '/api/user') return reply(response, 200, { login: 'newcomer' })
      if (request.method === 'GET' && url.pathname.startsWith('/api/repos/')) return reply(response, 404, {})
      if (request.method === 'POST' && url.pathname === '/api/user/repos') {
        const { name: repo } = JSON.parse(body) as { name: string }
        mkdirSync(join(bareRoot, 'newcomer'), { recursive: true })
        execFileSync('git', ['init', '--quiet', '--bare', '-b', 'main', join(bareRoot, `newcomer/${repo}.git`)])
        return reply(response, 201, { name: repo })
      }
      if (request.method === 'POST' && url.pathname.endsWith('/pages')) return reply(response, 201, {})
      return reply(response, 404, {})
    })
  })
  return new Promise((done) => server.listen(0, '127.0.0.1', () => done({ server, calls })))
}

async function main(): Promise<number> {
  // Outside the repo, so nothing here can lean on the repo's own packages.
  const work = mkdtempSync(join(tmpdir(), 'newcomer-'))
  say(`Working in ${work}, outside the repo.`)
  run(work, 'npm', ['create', 'automata@preview', 'my-game'], { npm_config_yes: 'true' })
  const game = join(work, 'my-game')
  run(game, 'npm', ['install', '--no-audit', '--no-fund'])
  const versions = JSON.parse(readFileSync(join(game, 'package.json'), 'utf8')) as { dependencies: Record<string, string> }
  say(`The game uses ${Object.entries(versions.dependencies).map(([n, v]) => `${n}@${v}`).join(', ')}.`)
  run(game, 'npm', ['run', 'check'])
  run(game, 'npm', ['run', 'build'])

  say('')
  say('No test repo yet (card O7), so the link goes to a stand-in for GitHub made here, not to github.com.')
  say('Criterion 20 is NOT met by this run: it needs the real test repo.')
  const bareRoot = join(work, 'bare')
  mkdirSync(bareRoot)
  const { server, calls } = await standInGithub(bareRoot, join(game, 'dist'))
  const base = address(server)
  const gitConfig = join(work, 'gitconfig')
  writeFileSync(
    gitConfig,
    `[user]\n\tname = Newcomer\n\temail = newcomer@example.com\n[credential]\n\thelper = "!f() { echo username=newcomer; echo password=${standInToken}; }; f"\n`,
  )
  let link: string | undefined
  try {
    say('$ npm run link')
    // Not execFileSync: the stand-in answers from this same process, so it must keep running meanwhile.
    const { stdout } = await promisify(execFile)('npm', ['run', 'link'], {
      cwd: game,
      env: {
        ...process.env,
        AUTOMATA_TEST_GITHUB: base,
        AUTOMATA_TEST_GIT: bareRoot,
        GIT_CONFIG_GLOBAL: gitConfig,
        GIT_CONFIG_NOSYSTEM: '1',
      },
    })
    say(stdout.trim())
    link = /Your game is live: (\S+)/.exec(stdout)?.[1]
    if (!link) throw new Error('npm run link did not print a link.')
    say(`GitHub was asked: ${calls.join(', ')}.`)

    const browser = await launch()
    try {
      const page = await openGame(browser, link, 'phone')
      await touchToWin(page)
      say(`On a small phone, by touch, the game at ${link} reached the win.`)
    } finally {
      await browser.close()
    }
  } finally {
    server.close()
  }
  say('The newcomer path works up to the stand-in. Criterion 20 is not met until it runs against the test repo.')
  return 0
}

process.exitCode = await main()
