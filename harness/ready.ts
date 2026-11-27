// Opens a built game the way a link would and waits until its first frame is on the screen, never on a sleep.
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { type IncomingMessage, type Server, type ServerResponse, createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { createRequire } from 'node:module'
import { extname, join, normalize } from 'node:path'
import type { Browser, Page } from 'playwright-core'
import { VULKAN_ARGS } from '../scripts/gpu/smoke/checks.ts'
import { type ProfileName, profiles } from './profiles.ts'

const types: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.wasm': 'application/wasm',
  '.woff2': 'font/woff2',
}

/** Answers a request from a folder. `prefix` is where the folder sits, as GitHub Pages puts a game at /my-game/. */
export function files(dir: string, prefix = '/'): (request: IncomingMessage, response: ServerResponse) => void {
  return (request, response) => {
    const path = decodeURIComponent(new URL(request.url ?? '/', 'http://x').pathname)
    if (!path.startsWith(prefix)) return void response.writeHead(404).end()
    let file = join(dir, normalize(`/${path.slice(prefix.length)}`))
    if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html')
    if (!existsSync(file)) return void response.writeHead(404).end()
    response.writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream' })
    response.end(readFileSync(file))
  }
}

/** Serves a folder on this machine only. */
export function serve(dir: string): Promise<Server> {
  const server = createServer(files(dir))
  return new Promise((done) => server.listen(0, '127.0.0.1', () => done(server)))
}

export const address = (server: Server): string => `http://127.0.0.1:${(server.address() as AddressInfo).port}`

/** True on a GPU pod: there the browser must draw on the NVIDIA card, as the smoke step proved it can. */
const onGpu = (): boolean => spawnSync('nvidia-smi', ['-L']).status === 0

// The pod's image holds playwright-core and its browser outside the change; use that copy there, as the smoke step does.
const imageCopy = '/usr/local/lib/node_modules/playwright-core'

/** Chromium: the image's on a pod (with the flags that reach the GPU), else `AUTOMATA_CHROMIUM` or Playwright's own. */
export async function launch(env: NodeJS.ProcessEnv = process.env): Promise<Browser> {
  const { chromium } = (
    existsSync(imageCopy) ? createRequire('/usr/local/lib/node_modules/')('playwright-core') : await import('playwright-core')
  ) as typeof import('playwright-core')
  const args = onGpu() ? VULKAN_ARGS : []
  const executablePath = env['AUTOMATA_CHROMIUM']
  return chromium.launch({ args, ...(executablePath ? { executablePath } : {}) })
}

/** Waits until the game says its first frame is drawn (`window.__automata.ready`). */
async function waitReady(page: Page, timeout = 30_000): Promise<void> {
  await page.waitForFunction(() => (window as { __automata?: { ready?: boolean } }).__automata?.ready === true, null, {
    timeout,
  })
}

/** The name of what draws the page's WebGL: an NVIDIA card on a pod, a software renderer in a container. */
export function renderer(page: Page): Promise<string> {
  return page.evaluate(() => {
    const gl = document.createElement('canvas').getContext('webgl2')
    const info = gl?.getExtension('WEBGL_debug_renderer_info')
    return gl && info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : 'no WebGL2'
  })
}

/** A new page in the named profile, on `url`, once the game is ready. */
export async function openGame(browser: Browser, url: string, profile: ProfileName): Promise<Page> {
  const context = await browser.newContext(profiles[profile])
  const page = await context.newPage()
  await page.goto(url)
  await waitReady(page)
  return page
}
