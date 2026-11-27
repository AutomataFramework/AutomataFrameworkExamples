import { clear, drawRect, drawText, run } from '@automataframework/2d'
import { type Controls, type Game, content, defaultBindings } from '@automataframework/core'
import { readInputs } from '@automataframework/core/browser'

type Me = { x: number; y: number }

// Push the left stick or the arrow pad and the square moves. The arrow keys work too, so no gamepad is needed to try it.
const game: Game<Me> = {
  init: () => ({ x: 152, y: 82 }),
  update(state, inputs) {
    const [dx, dy] = inputs[0]?.sticks['move'] ?? [0, 0]
    state.game.x = Math.min(304, Math.max(0, state.game.x + dx * 2))
    state.game.y = Math.min(164, Math.max(0, state.game.y + dy * 2))
    return state
  },
  draw(state) {
    clear('#1d2b53')
    drawRect(state.game.x, state.game.y, 16, 16, '#ffec27')
    drawText('Push the stick.', 160, 10, { align: 'center', color: '#ffffff' })
  },
}

// The game reads its inputs from here: the sticks and pads in "controls.json", and the arrow keys.
let input: ReturnType<typeof readInputs> | undefined
run({
  ...game,
  update(state) {
    const controls = content<Controls>('controls')
    input ??= readInputs(controls, defaultBindings(controls))
    return game.update(state, input.read())
  },
})
