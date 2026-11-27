// Reading what a game shows, for the cases: the colour of one pixel, and where a point of the game is on the page.
import type { Page } from 'playwright-core'

/**
 * The colour of one pixel of the game's own screen (`x`, `y` counted from the top left, in the game's pixels).
 * The picture is read in the browser's next frame, straight after the game has drawn it and before it is shown.
 */
export function pixel(page: Page, x: number, y: number): Promise<[number, number, number]> {
  return page.evaluate(
    ([px, py]) =>
      new Promise<[number, number, number]>((resolve, reject) =>
        requestAnimationFrame(() => {
          const canvas = document.querySelector('canvas') as HTMLCanvasElement
          const gl = (canvas.getContext('webgl2') ?? canvas.getContext('webgl')) as WebGL2RenderingContext | null
          if (!gl) return reject(new Error('The game screen is not a WebGL canvas.'))
          const out = new Uint8Array(4)
          gl.readPixels(px, canvas.height - 1 - py, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, out)
          resolve([out[0] ?? 0, out[1] ?? 0, out[2] ?? 0])
        }),
      ),
    [x, y] as [number, number],
  )
}

/** Where a point of the game's screen is on the page, for a finger. */
export function onPage(page: Page, x: number, y: number): Promise<{ x: number; y: number }> {
  return page.evaluate(
    ([gx, gy]) => {
      const canvas = document.querySelector('canvas') as HTMLCanvasElement
      const box = canvas.getBoundingClientRect()
      return { x: box.left + (gx * box.width) / canvas.width, y: box.top + (gy * box.height) / canvas.height }
    },
    [x, y] as [number, number],
  )
}
