import { describe, expect, it, vi } from 'vitest'

import type { EventOverlayInfo } from '../Store'
import ChartStore from '../Store'
import type OverlayImp from '../component/Overlay'

interface FakeOverlay {
  id: string
  zLevel: number
  fixedZLevel?: boolean
}

interface Rig {
  store: ChartStore
  overlays: FakeOverlay[]
  updatePane: ReturnType<typeof vi.fn>
  hover: (id: string | null) => void
  order: () => string[]
  /** zLevel by drawing id, so a re-sort of the array cannot hide a mutation. */
  levels: () => Record<string, number>
}

/** The real hover bookkeeping on a bare Store; only the chart's repaint is stubbed. */
function rig(overlays: FakeOverlay[]): Rig {
  const updatePane = vi.fn()
  const store = Object.assign(Object.create(ChartStore.prototype) as object, {
    _overlays: new Map([['candle_pane', overlays]]),
    _hoverOverlayInfo: { paneId: 'candle_pane', overlay: null, figureType: 'none', figureIndex: -1, figure: null },
    _chart: { updatePane }
  }) as unknown as ChartStore
  const hover = (id: string | null): void => {
    const overlay = id === null ? null : (overlays.find((o) => o.id === id) as unknown as OverlayImp)
    const info = { paneId: 'candle_pane', overlay, figureType: 'other', figureIndex: 0, figure: null } as unknown as EventOverlayInfo
    store.setHoverOverlayInfo(
      info,
      () => false,
      () => false
    )
  }
  return {
    store,
    overlays,
    updatePane,
    hover,
    order: () => overlays.map((o) => o.id),
    levels: () => {
      const levels: Record<string, number> = {}
      for (const overlay of overlays) {
        levels[overlay.id] = overlay.zLevel
      }
      return levels
    }
  }
}

const info = (id: string, zLevel = 0, fixedZLevel = false): FakeOverlay => ({ id, zLevel, fixedZLevel })

describe('hover is a sort key, not a zLevel override', () => {
  it('paints the hovered drawing last without touching any zLevel', () => {
    const r = rig([info('a'), info('b'), info('c')])
    r.hover('b')
    expect(r.order()).toEqual(['a', 'c', 'b'])
    expect(r.levels()).toEqual({ a: 0, b: 0, c: 0 })
    expect(r.updatePane).toHaveBeenCalledTimes(1)
  })

  it('restores the declared zLevel order when the pointer leaves', () => {
    const r = rig([info('a'), info('b', 10), info('c', 20)])
    r.hover('b')
    expect(r.order()).toEqual(['a', 'c', 'b'])
    r.hover(null)
    expect(r.order()).toEqual(['a', 'b', 'c'])
  })

  it('moves the hover raise from one drawing to the next', () => {
    const r = rig([info('a'), info('b'), info('c')])
    r.hover('a')
    expect(r.order()).toEqual(['b', 'c', 'a'])
    r.hover('c')
    // The hovered one is last; the other two keep the order the previous sort
    // left them in, since they have the same declared zLevel.
    expect(r.order()[2]).toBe('c')
    expect(r.levels()).toEqual({ a: 0, b: 0, c: 0 })
  })

  it('keeps a drawing above the crosshair in its own pass while hovered', () => {
    // A hover used to set zLevel to MAX_SAFE_INTEGER, which pushed the drawing
    // into the second pass and made it vanish from a first-pass-only render.
    const r = rig([info('a'), info('b', 1000), info('c', 500)])
    r.hover('a')
    expect(r.order()).toEqual(['c', 'b', 'a'])
    expect(r.levels()).toEqual({ a: 0, b: 1000, c: 500 })
  })

  it('lets fixedZLevel opt out of the hover raise', () => {
    const r = rig([info('a'), info('b', 0, true), info('c')])
    r.hover('b')
    expect(r.order()).toEqual(['a', 'b', 'c'])
    expect(r.overlays[1].zLevel).toBe(0)
  })

  it('still raises a neighbour when a fixedZLevel drawing is hovered last', () => {
    const r = rig([info('a'), info('b', 0, true)])
    r.hover('b')
    r.hover('a')
    expect(r.order()).toEqual(['b', 'a'])
  })

  it('does not repaint when a hover callback asks to suppress it', () => {
    const r = rig([info('a'), info('b')])
    const infoB = { paneId: 'candle_pane', overlay: r.overlays[1] as unknown as OverlayImp, figureType: 'other', figureIndex: 0, figure: null } as unknown as EventOverlayInfo
    r.store.setHoverOverlayInfo(
      infoB,
      () => true,
      () => false
    )
    expect(r.updatePane).not.toHaveBeenCalled()
    expect(r.order()).toEqual(['a', 'b'])
  })
})
