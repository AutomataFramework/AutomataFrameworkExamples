// Fails when a content file (art, sound, music, models, fonts, story) sits outside a folder that carries the
// content notice.
//
// Why: the code here is MIT, but the sample games' story, art and music are all rights reserved to the Owner, as
// DOOM did with its code and its data (the Owner, 2026-11-27). The MIT licence at the root covers everything that
// no notice covers, so a picture dropped in the wrong folder would quietly become free to copy. This check stops
// that before it reaches `main`.
//
// The rule: every content file has a `CONTENT-LICENSE.md` in its own folder or in a folder above it (the root does
// not count, since that is where the MIT licence is), and that notice says "All rights reserved". It reads the
// file list from git, so it sees exactly what a commit holds. It has no dependencies, so Node alone runs it.
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

/** The name of the notice file. */
export const NOTICE = 'CONTENT-LICENSE.md'

/** The words a notice must hold, so a notice cannot be emptied or turned into a free licence by mistake. */
export const NOTICE_WORDS = 'All rights reserved'

/** File endings that are always content: pictures, sound, music, video, 3D models, fonts. */
const CONTENT_ENDINGS = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'bmp', 'tga', 'psd', 'aseprite', 'ase', 'svg', 'ico',
  'wav', 'ogg', 'mp3', 'flac', 'm4a', 'aac', 'opus', 'mid', 'midi',
  'mp4', 'webm', 'mov',
  'glb', 'gltf', 'fbx', 'obj', 'blend', 'vox', 'ktx2', 'hdr', 'exr',
  'ttf', 'otf', 'woff', 'woff2',
])

/** Folder names whose files are content whatever their ending (the story, dialogue and other written content). */
const CONTENT_FOLDERS = new Set(['content', 'story', 'assets', 'art', 'audio', 'music', 'sound', 'sounds'])

/** Whether one path (relative, with `/`) is a content file. */
export function isContent(path: string): boolean {
  const parts = path.split('/')
  const name = parts.at(-1) ?? ''
  if (name === NOTICE) return false
  const ending = name.includes('.') ? (name.split('.').at(-1) ?? '').toLowerCase() : ''
  if (CONTENT_ENDINGS.has(ending)) return true
  return parts.slice(0, -1).some((folder) => CONTENT_FOLDERS.has(folder.toLowerCase()))
}

/** The folders a notice for `path` may sit in, nearest first, the root left out. */
function foldersAbove(path: string): string[] {
  const parts = path.split('/').slice(0, -1)
  return parts.map((_, i) => parts.slice(0, parts.length - i).join('/'))
}

/** One content file with no notice over it, or a notice that does not say what it must. */
export interface Problem {
  path: string
  what: string
}

/**
 * Everything wrong, given every tracked path and a way to read a notice. Pure, so the tests give it a made-up list.
 */
export function findProblems(paths: readonly string[], readNotice: (path: string) => string): Problem[] {
  const tracked = new Set(paths)
  const problems: Problem[] = []
  for (const path of paths) {
    if (path.split('/').at(-1) === NOTICE) {
      if (!path.includes('/')) problems.push({ path, what: 'a notice at the root would cover the MIT code too' })
      else if (!readNotice(path).includes(NOTICE_WORDS)) {
        problems.push({ path, what: `this notice does not say "${NOTICE_WORDS}"` })
      }
      continue
    }
    if (!isContent(path)) continue
    if (!foldersAbove(path).some((folder) => tracked.has(`${folder}/${NOTICE}`))) {
      problems.push({ path, what: `this content file has no ${NOTICE} in its folder or any folder above it` })
    }
  }
  return problems
}

/** The text a person reads when the check fails. */
export function explain(problems: readonly Problem[]): string {
  return [
    'Some art, sound, music or story is in a folder without the content notice:',
    '',
    ...problems.map((p) => `  - ${p.path}: ${p.what}`),
    '',
    `Move each file into a game's folder that has ${NOTICE} (such as games/), or, for a new folder of the`,
    `Owner's content, copy games/${NOTICE} into it.`,
  ].join('\n')
}

function main(): void {
  const root = process.argv[2] ?? '.'
  const paths = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean)
  const problems = findProblems(paths, (path) => readFileSync(join(root, path), 'utf8'))
  if (problems.length === 0) {
    console.log(`All ${paths.length} files are fine: every content file is under a ${NOTICE}.`)
    return
  }
  console.error(explain(problems))
  process.exitCode = 1
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main()
