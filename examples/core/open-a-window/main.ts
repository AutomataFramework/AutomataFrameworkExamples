import { clear, drawText, run } from '@automataframework/2d'
import type { Game } from '@automataframework/core'

// This is all it takes to open a window: a game that paints it and says hello.
const game: Game<null> = {
  init: () => null,
  update: (state) => state,
  draw() {
    clear('#1d2b53')
    drawText('Hello. This is a window.', 160, 80, { align: 'center', color: '#ffffff' })
  },
}

run(game)
