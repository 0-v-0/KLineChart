import { describe, expect, it } from 'vitest'

import type { OverlayCreateFiguresCallbackParams } from '../component/Overlay'
import { arrowMark, type ArrowDirection } from '../extension/overlay/arrowMark'

function params(x: number, y: number): OverlayCreateFiguresCallbackParams<unknown> {
  return {
    chart: {},
    overlay: { id: 'a1', points: [{ timestamp: 0, value: 100 }], extendData: {} },
    coordinates: [{ x, y }],
    bounding: { width: 400, height: 300, top: 0, left: 0, right: 400, bottom: 300 },
    xAxis: null,
    yAxis: null
  } as unknown as OverlayCreateFiguresCallbackParams<unknown>
}

function outline(direction: ArrowDirection, x = 100, y = 100): Array<{ x: number; y: number }> {
  const figures = arrowMark(direction)().createPointFigures?.(params(x, y)) as Array<{ type: string; attrs: { coordinates: Array<{ x: number; y: number }> } }>
  return figures[0].attrs.coordinates
}

describe('the arrow marks', () => {
  it('sticks the tip on the anchor and points the tail away from it', () => {
    const up = outline('up')
    // The tip is the first point, back at the anchor; everything after it is below.
    expect(up[0]).toEqual({ x: 100, y: 100 })
    expect(up.slice(1).every((p) => p.y > 100)).toBe(true)

    const down = outline('down')
    expect(down.slice(1).every((p) => p.y < 100)).toBe(true)

    const left = outline('left')
    expect(left.slice(1).every((p) => p.x > 100)).toBe(true)

    const right = outline('right')
    expect(right.slice(1).every((p) => p.x < 100)).toBe(true)
  })

  it('is a single click, like every one-point mark', () => {
    expect(arrowMark('up')().totalStep).toBe(2)
  })

  it('gives the opposite directions opposite TV colours', () => {
    const up = arrowMark('up')().getProperties?.('a1') as { backgroundColor: string }
    const down = arrowMark('down')().getProperties?.('a1') as { backgroundColor: string }
    expect(up.backgroundColor).toBe('#089981')
    expect(down.backgroundColor).toBe('#CC2F3C')
    expect(up.backgroundColor).not.toBe(down.backgroundColor)
  })

  it('puts the label past the tail, on the side the arrow points to', () => {
    const figures = arrowMark('up')().createPointFigures?.(params(100, 100)) as Array<{ type: string; attrs: { x: number; y: number; baseline: string } }>
    const label = figures[1]
    expect(label.attrs.y).toBeGreaterThan(100)
    // Below the tail: the text hangs from its top edge, further up is up.
    expect(label.attrs.baseline).toBe('top')
  })
})
