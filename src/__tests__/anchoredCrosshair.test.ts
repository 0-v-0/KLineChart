import { describe, expect, it } from 'vitest'

import type Chart from '../Chart'
import type { KLineData } from '../common/Data'
import type { DataLoader, DataLoaderGetBarsParams, DataLoaderGetRangeParams } from '../common/DataLoader'
import type { Period } from '../common/Period'
import type { SymbolInfo } from '../common/SymbolInfo'
import ChartStore from '../Store'

const HOUR_MS = 3_600_000
const BASE = Date.UTC(2026, 3, 2, 0, 0, 0)

// A price axis whose scale the test changes, as a price-scale drag or an
// auto-scale after a scroll does: `pxPerUnit` pixels per price unit from `top`.
function createAxis() {
  const axis = {
    top: 100,
    pxPerUnit: 2,
    convertToPixel: (value: number) => (axis.top - value) * axis.pxPerUnit,
    convertFromPixel: (px: number) => axis.top - px / axis.pxPerUnit
  }
  return axis
}

function createMockChart(axis: ReturnType<typeof createAxis>): Chart {
  return {
    layout: () => {
      /* noop */
    },
    updatePane: () => {
      /* noop */
    },
    getDrawPaneById: (id: string) => (id === 'candle_pane' ? { getYAxisComponentById: () => axis } : null)
  } as unknown as Chart
}

function createSyncLoader(data: KLineData[]): DataLoader {
  return {
    getBars: (params: DataLoaderGetBarsParams) => {
      if (params.type === 'init') {
        params.callback(data, { backward: false, forward: false })
      }
    },
    subscribeBar: () => {
      /* noop */
    },
    unsubscribeBar: () => {
      /* noop */
    },
    getRange: (params: DataLoaderGetRangeParams) => {
      params.callback([])
    }
  }
}

function buildStore() {
  const axis = createAxis()
  const store = new ChartStore(createMockChart(axis))
  store.setSymbol({ ticker: 'AAA', pricePrecision: 2, volumePrecision: 0 } as SymbolInfo)
  store.setPeriod({ type: 'hour', span: 1 } as Period)
  const data: KLineData[] = []
  for (let i = 0; i < 50; i++) {
    data.push({ timestamp: BASE + i * HOUR_MS, open: 100, high: 101, low: 99, close: 100, volume: 1 })
  }
  store.setDataLoader(createSyncLoader(data))
  return { store, axis }
}

describe('anchored (touch) crosshair', () => {
  it('stays on its bar when the time scale zooms', () => {
    const { store } = buildStore()
    store.setAnchoredCrosshair({ x: store.dataIndexToCoordinate(30), y: 40, paneId: 'candle_pane' })
    store.setBarSpace(store.getBarSpace().bar * 2)
    store.reanchorCrosshair()
    expect(store.getCrosshair().x).toBeCloseTo(store.dataIndexToCoordinate(30), 0)
    expect(store.getCrosshair().timestamp).toBe(BASE + 30 * HOUR_MS)
  })

  it('stays on its price when the price scale changes', () => {
    const { store, axis } = buildStore()
    store.setAnchoredCrosshair({ x: store.dataIndexToCoordinate(30), y: 40, paneId: 'candle_pane' })
    const price = axis.convertFromPixel(40)
    axis.pxPerUnit = 5
    store.reanchorCrosshair()
    expect(store.getCrosshair().y).toBeCloseTo(axis.convertToPixel(price), 6)
  })

  it('lets go of the pin when the crosshair is set some other way (a pointer)', () => {
    const { store } = buildStore()
    store.setAnchoredCrosshair({ x: store.dataIndexToCoordinate(30), y: 40, paneId: 'candle_pane' })
    const pointerX = store.dataIndexToCoordinate(20)
    store.setCrosshair({ x: pointerX, y: 40, paneId: 'candle_pane' })
    store.setBarSpace(store.getBarSpace().bar * 2)
    store.reanchorCrosshair()
    expect(store.getCrosshair().x).toBe(pointerX)
  })
})
