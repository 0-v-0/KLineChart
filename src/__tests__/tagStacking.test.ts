import { describe, expect, it } from 'vitest'

import OverlayXAxisView from '../view/OverlayXAxisView'
import OverlayYAxisView, { stackTags, type TagBox } from '../view/OverlayYAxisView'

interface LayoutView {
  _layoutTags: () => void
  _tagShifts: Map<string, number>
  stacksTags: () => boolean
}

interface FakeOverlay {
  id: string
  points: Array<{ value: number }>
  figureStyles: Record<string, unknown>
  styles: Record<string, unknown>
  createYAxisFigures: () => unknown[]
  createPointFigures: (params: { coordinates: Array<{ x: number; y: number }> }) => unknown[]
}

function createOverlay(id: string, y: number): FakeOverlay {
  return {
    id,
    points: [{ value: y }],
    figureStyles: {},
    styles: {},
    createYAxisFigures: () => [],
    createPointFigures: ({ coordinates }) => [{ type: 'text', attrs: { y: coordinates[0].y, text: id } }]
  }
}

function yView(overlays: FakeOverlay[]): LayoutView {
  const styles = {
    overlay: { text: { size: 12, paddingTop: 2, paddingBottom: 2 } },
    candle: { priceMark: { show: false, last: { show: false, text: { show: false } } } }
  }
  const chartStore = {
    getStyles: () => styles,
    isOverlayShown: () => true,
    getDataList: () => []
  }
  const chart = { getChartStore: () => chartStore, getStyles: () => styles }
  // A normal price axis: a higher price sits higher on screen (a smaller y).
  const yAxis = { isInCandle: () => true, convertToPixel: (value: number) => 400 - value, convertToNicePixel: (value: number) => 400 - value, convertFromPixel: (y: number) => 400 - y, reverse: false }
  const pane = { getChart: () => chart, getAxisComponent: () => yAxis }
  return Object.assign(Object.create(OverlayYAxisView.prototype) as object, {
    _tagShifts: new Map<string, number>(),
    _inDefaultFigures: false,
    getWidget: () => ({ getPane: () => pane, getBounding: () => ({ width: 60, height: 400 }) }),
    getCompleteOverlays: () => overlays,
    getProgressOverlay: () => null,
    // Figures come straight from the fake overlays; no axes involved.
    getFigures: (overlay: FakeOverlay, coordinates: Array<{ x: number; y: number }>) => overlay.createPointFigures({ coordinates })
  }) as unknown as LayoutView
}

describe('stacking the price tags on the y axis', () => {
  it('pushes two tags at the same price apart', () => {
    const view = yView([createOverlay('a', 100), createOverlay('b', 100)])
    view._layoutTags()
    const dyA = view._tagShifts.get('a:0:0')
    const dyB = view._tagShifts.get('b:0:0')
    expect(dyA).toBeDefined()
    expect(dyB).toBeDefined()
    // 12px text + 2 + 2 padding + 1 gap: they end up a full label apart.
    expect(Math.abs((dyA ?? 0) - (dyB ?? 0))).toBeGreaterThanOrEqual(16)
  })

  it('leaves tags that do not overlap where they are', () => {
    const view = yView([createOverlay('a', 100), createOverlay('b', 200)])
    view._layoutTags()
    expect(view._tagShifts.size).toBe(0)
  })

  it('excludes the last-price tag when the price mark is hidden', () => {
    const view = yView([createOverlay('a', 100)])
    view._layoutTags()
    expect(view._tagShifts.size).toBe(0)
  })

  it('does not stack on the time axis', () => {
    const view = yView([createOverlay('a', 100), createOverlay('b', 100)])
    const xView = Object.assign(Object.create(OverlayXAxisView.prototype) as object, view) as unknown as LayoutView
    expect(xView.stacksTags()).toBe(false)
    xView._layoutTags()
    expect(xView._tagShifts.size).toBe(0)
  })
})

function tag(key: string, y: number, value?: number, fixed = false): TagBox {
  return { key, y, height: 16, fixed, ...(value === undefined ? {} : { value }) }
}

describe('stackTags', () => {
  it('orders two tags on the same pixel by the price they label', () => {
    const shifts = stackTags([tag('low', 100, 100), tag('high', 100, 110)])
    // Higher price stays on top: a smaller y.
    expect((shifts.get('high') ?? 0) < (shifts.get('low') ?? 0)).toBe(true)
  })

  it('flips that order on a reversed scale', () => {
    const shifts = stackTags([tag('low', 100, 100), tag('high', 100, 110)], true)
    expect((shifts.get('high') ?? 0) > (shifts.get('low') ?? 0)).toBe(true)
  })

  it('keeps a stack inside the pane instead of letting it run off the bottom', () => {
    const shifts = stackTags([tag('a', 95, 110), tag('b', 99, 100)], false, { top: 0, bottom: 100 })
    const aEnd = 95 + (shifts.get('a') ?? 0)
    const bEnd = 99 + (shifts.get('b') ?? 0)
    expect(aEnd).toBeLessThan(100)
    expect(bEnd).toBeLessThan(100)
    expect(aEnd).toBeLessThan(bEnd)
  })

  it('leaves a tag whose price is off the pane out of the stack', () => {
    const shifts = stackTags([tag('inside', 95, 110), tag('outside', 140, 100)], false, { top: 0, bottom: 100 })
    expect(shifts.has('outside')).toBe(false)
    expect(shifts.has('inside')).toBe(true)
  })
})

describe('the last-price tag box', () => {
  it('spans the rows drawn above and below the price', () => {
    const styles = {
      candle: {
        priceMark: {
          show: true,
          last: {
            show: true,
            text: { show: true, size: 12, paddingTop: 2, paddingBottom: 2, backgroundColor: null },
            extendTexts: [
              { show: true, position: 'below_price', size: 12, paddingTop: 2, paddingBottom: 2 },
              { show: true, position: 'above_price', size: 12, paddingTop: 2, paddingBottom: 2 }
            ]
          }
        }
      },
      overlay: { text: {} }
    }
    const chartStore = {
      getStyles: () => styles,
      getDataList: () => [{ timestamp: 0, open: 100, high: 110, low: 90, close: 105, volume: 1 }],
      getInnerFormatter: () => ({ formatExtendText: () => '00:12' })
    }
    const chart = { getChartStore: () => chartStore, getStyles: () => styles }
    const yAxis = { isInCandle: () => true, convertToNicePixel: (value: number) => 400 - value }
    const pane = { getChart: () => chart, getAxisComponent: () => yAxis }
    const view = Object.assign(Object.create(OverlayYAxisView.prototype) as object, {
      getWidget: () => ({ getPane: () => pane, getBounding: () => ({ width: 60, height: 400 }) })
    }) as unknown as { _lastPriceBox: () => TagBox | null }
    const box = view._lastPriceBox()
    // 12 + 2 + 2 for the price row, plus 16 for each of the two extend rows.
    expect(box?.height).toBe(16 + 16 + 16)
    expect(box?.fixed).toBe(true)
  })
})
