// The first four small examples (E2a): each is opened the way a link would open it, and one fact is read from it.
import type { Page } from 'playwright-core'
import type { Case } from '../../cases.ts'
import { onPage, pixel } from '../../screen.ts'

type Me = { x: number; y: number }
type Automata = { state(): { tick: number; game: Me } }

/** The square's place, from the game's own state. */
const square = (page: Page): Promise<Me> =>
  page.evaluate(() => {
    const { state } = (window as unknown as { __automata: Automata }).__automata
    return { x: state().game.x, y: state().game.y }
  })

/** Waits until the square has moved at least `distance` along `axis`, from `from`, and says where it is then. */
async function movedBy(page: Page, from: Me, axis: 'x' | 'y', distance: number): Promise<Me> {
  await page.waitForFunction(
    ([start, which, far]) => {
      const game = (window as unknown as { __automata: Automata }).__automata.state().game
      return game[which as 'x' | 'y'] - (start as number) >= (far as number)
    },
    [from[axis], axis, distance] as const,
    { timeout: 10_000 },
  )
  return square(page)
}

const near = (colour: [number, number, number], want: [number, number, number]): boolean =>
  colour.every((value, i) => Math.abs(value - (want[i] ?? 0)) <= 2)

const blue: [number, number, number] = [0x1d, 0x2b, 0x53]
const red: [number, number, number] = [0xff, 0x00, 0x4d]
const green: [number, number, number] = [0x00, 0xe4, 0x36]

export const cases: Case[] = [
  {
    id: '1a/open-a-window',
    slice: '1a',
    check: 'The window opens at the size automata.json says, and it is painted dark blue.',
    kind: 'page',
    game: 'examples/core-open-a-window',
    profile: 'computer',
    async run(page) {
      const size = await page.evaluate(() => {
        const canvas = document.querySelector('canvas') as HTMLCanvasElement
        return [canvas.width, canvas.height]
      })
      if (size.join('x') !== '320x180') throw new Error(`The window is ${size.join(' by ')}, not 320 by 180.`)
      const corner = await pixel(page, 2, 2)
      if (!near(corner, blue)) throw new Error(`The corner is ${corner.join(',')}, not the dark blue ${blue.join(',')}.`)
    },
  },
  {
    id: '1a/draw-shapes',
    slice: '1a',
    check: 'The box is drawn red and the circle green, where the example puts them.',
    kind: 'page',
    game: 'examples/shapes-draw-shapes',
    profile: 'tablet',
    async run(page) {
      const box = await pixel(page, 70, 80)
      if (!near(box, red)) throw new Error(`The middle of the box is ${box.join(',')}, not red ${red.join(',')}.`)
      const circle = await pixel(page, 160, 90)
      if (!near(circle, green)) throw new Error(`The middle of the circle is ${circle.join(',')}, not green ${green.join(',')}.`)
      const between = await pixel(page, 115, 90)
      if (!near(between, blue)) throw new Error(`Between them is ${between.join(',')}, not the dark blue ${blue.join(',')}.`)
    },
  },
  {
    id: '1a/move-by-touch',
    slice: '1a',
    check: 'A finger dragged to the right on a phone moves the square to the right, and not up or down.',
    kind: 'page',
    game: 'examples/input-move-by-touch',
    profile: 'phone',
    async run(page) {
      const before = await square(page)
      const from = await onPage(page, 160, 90)
      const cdp = await page.context().newCDPSession(page)
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: from.x, y: from.y }] })
      try {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: from.x + 40, y: from.y }] })
        const after = await movedBy(page, before, 'x', 30)
        if (after.y !== before.y) throw new Error(`The square also moved up or down (from ${before.y} to ${after.y}).`)
      } finally {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
      }
    },
  },
  {
    id: '1a/move-by-gamepad',
    slice: '1a',
    check: 'Pushing the left stick of a gamepad to the right moves the square to the right, and not up or down.',
    kind: 'page',
    game: 'examples/input-move-by-gamepad',
    profile: 'computer',
    async run(page) {
      const before = await square(page)
      // A stand-in gamepad: a real one cannot be plugged into a test, so the page is told one is there, pushed right.
      await page.evaluate(() => {
        const pad = { connected: true, index: 0, id: 'test pad', mapping: 'standard', buttons: [], axes: [1, 0, 0, 0] }
        Object.assign(navigator, { getGamepads: () => [pad] })
      })
      const after = await movedBy(page, before, 'x', 30)
      if (after.y !== before.y) throw new Error(`The square also moved up or down (from ${before.y} to ${after.y}).`)
    },
  },
]
