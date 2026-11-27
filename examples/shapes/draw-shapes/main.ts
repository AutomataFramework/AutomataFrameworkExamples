import { clear, drawCircle, drawLine, drawRect, drawText, run } from '@automataframework/2d'
import type { Game } from '@automataframework/core'

// A box, a circle and a line. Every number is a place on the 320 by 180 screen, counted from the top left.
const game: Game<null> = {
  init: () => null,
  update: (state) => state,
  draw() {
    clear('#1d2b53')
    drawRect(40, 50, 60, 60, '#ff004d')
    drawCircle(160, 90, 30, '#00e436')
    drawLine(220, 50, 280, 130, '#ffec27')
    drawText('A box, a circle and a line.', 160, 140, { align: 'center', color: '#ffffff' })
  },
}

run(game)
