import { clear, drawRect, drawText, run } from '@automataframework/2d'
import { type Controls, type Game, content, defaultBindings } from '@automataframework/core'
import { readInputs } from '@automataframework/core/browser'

type Me = { x: number; y: number }

// Touch the screen and drag. The square goes the way you drag. The arrow keys and a gamepad work too.
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
    drawText('Touch and drag.', 160, 10, { align: 'center', color: '#ffffff' })
  },
}

let input: ReturnType<typeof readInputs> | undefined

// A drag becomes a push on the "move" stick: the farther you drag, the faster it goes.
let start: [number, number] | null = null
const push = (x: number, y: number) => {
  const [dx, dy] = [(x - start![0]) / 40, (y - start![1]) / 40]
  const length = Math.max(1, Math.hypot(dx, dy))
  input?.touch('move', [dx / length, dy / length])
}
window.addEventListener('pointerdown', (e) => ((start = [e.clientX, e.clientY]), push(e.clientX, e.clientY)))
window.addEventListener('pointermove', (e) => start && push(e.clientX, e.clientY))
const letGo = () => ((start = null), input?.touch('move', false))
window.addEventListener('pointerup', letGo)
window.addEventListener('pointercancel', letGo)

// The game reads its inputs from here, so touch, a gamepad and keys all move the square.
run({
  ...game,
  update(state) {
    const controls = content<Controls>('controls')
    input ??= readInputs(controls, defaultBindings(controls))
    return game.update(state, input.read())
  },
})
