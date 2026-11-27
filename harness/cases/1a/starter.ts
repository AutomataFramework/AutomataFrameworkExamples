// The game a newcomer gets from `npm create automata`, built by `pnpm build:games` into `examples/starter/`.
import type { Page } from 'playwright-core'
import type { Case } from '../../cases.ts'

type Automata = { state(): { outcome?: string; game: { goal: [number, number] } } }

/** Holds a finger on the yellow square until the game says the player won. A real touch, not a mouse. */
export async function touchToWin(page: Page): Promise<void> {
  const goal = await page.evaluate(() => {
    const game = (window as unknown as { __automata: Automata }).__automata.state().game
    const canvas = document.querySelector('canvas') as HTMLCanvasElement
    const box = canvas.getBoundingClientRect()
    // The middle of the goal, which is 16 by 16 in the game's own pixels.
    return {
      x: box.left + ((game.goal[0] + 8) * box.width) / canvas.width,
      y: box.top + ((game.goal[1] + 8) * box.height) / canvas.height,
    }
  })
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: goal.x, y: goal.y }] })
  try {
    await page.waitForFunction(
      () => (window as unknown as { __automata: Automata }).__automata.state().outcome === 'win',
      null,
      { timeout: 20_000 },
    )
  } finally {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  }
}

export const cases: Case[] = [
  {
    id: '1a/starter-wins-on-phone',
    slice: '1a',
    check: 'The game a newcomer gets from one line plays to a win on a small phone, by touch.',
    kind: 'page',
    game: 'examples/starter',
    profile: 'phone',
    run: touchToWin,
  },
]
