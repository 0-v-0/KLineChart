import { beforeAll, describe, expect, it, vi } from 'vitest'

import type EventImp from '../Event'
import type { DataLoader } from '../common/DataLoader'
import type { MouseTouchEvent } from '../common/EventHandler'
import type { SymbolInfo } from '../common/SymbolInfo'
import ChartStore from '../Store'
import { WidgetNameConstants } from '../widget/types'
import type Chart from '../Chart'

let EventCtor: typeof EventImp

beforeAll(async () => {
  vi.stubGlobal('window', { navigator: { userAgent: 'Linux' } })
  EventCtor = (await import('../Event')).default
})

const HOUR_MS = 3_600_000

function storeWithBars(count: number): ChartStore {
  const chart = { layout: () => undefined, updatePane: () => undefined } as unknown as Chart
  const store = new ChartStore(chart)
  store.setSymbol({ ticker: 'AAA', pricePrecision: 2, volumePrecision: 0 } as SymbolInfo)
  store.setPeriod({ type: 'hour', span: 1 })
  const bars = Array.from({ length: count }, (_, i) => ({ timestamp: i * HOUR_MS, open: 100, high: 101, low: 99, close: 100, volume: 1 }))
  const loader: DataLoader = {
    getBars: (params) => {
      if (params.type === 'init') {
        params.callback(bars, { backward: false, forward: false })
      }
    },
    subscribeBar: () => undefined,
    unsubscribeBar: () => undefined,
    getRange: (params) => {
      params.callback([])
    }
  }
  store.setTotalBarSpace(1100)
  store.setDataLoader(loader)
  return store
}

describe('zoom anchored at the right edge', () => {
  it('accepts right_edge through the public setter', () => {
    const store = storeWithBars(500)
    store.setZoomAnchor('right_edge')
    expect(store.getZoomAnchor()).toEqual({ main: 'right_edge', xAxis: 'right_edge' })
  })

  it('keeps the right edge on the same bar while zooming', () => {
    const store = storeWithBars(500)
    store.setZoomAnchor('right_edge')
    const last = store.getDataList().length - 1
    store.setLastBarRightSideDiffBarCount(30)
    const edgeIndex = store.coordinateToFloatIndex(1100)
    const lastX = store.dataIndexToCoordinate(last)
    store.zoom(1, { x: 300 }, 'main')

    expect(store.coordinateToFloatIndex(1100)).toBeCloseTo(edgeIndex, 6)
    expect(store.getLastBarRightSideDiffBarCount()).toBeCloseTo(30, 6)
    expect(store.dataIndexToCoordinate(last)).toBeLessThan(lastX)
  })

  it('lets anchorAtCursor override a configured right_edge anchor', () => {
    const store = storeWithBars(500)
    store.setZoomAnchor('right_edge')
    const cursorIndex = store.coordinateToFloatIndex(300)
    store.zoom(1, { x: 300 }, 'main', true)

    expect(store.coordinateToFloatIndex(300)).toBeCloseTo(cursorIndex, 6)
  })

  it('leaves the cursor anchored when the mode is cursor', () => {
    const store = storeWithBars(500)
    store.setZoomAnchor('cursor')
    const cursorIndex = store.coordinateToFloatIndex(300)
    store.zoom(1, { x: 300 }, 'main')
    expect(store.coordinateToFloatIndex(300)).toBeCloseTo(cursorIndex, 6)
  })
})

interface WheelRig {
  handler: EventImp
  zoom: ReturnType<typeof vi.fn>
}

function wheelRig(name: string): WheelRig {
  const zoom = vi.fn()
  const widget = {
    getName: () => name,
    getBounding: () => ({ left: 5, top: 0, width: 1100, height: 30 })
  }
  const handler = Object.assign(Object.create(EventCtor.prototype) as object, {
    _chart: { getChartStore: () => ({ zoom }) },
    _findWidgetByEvent: () => ({ widget, pane: null })
  }) as unknown as EventImp
  return { handler, zoom }
}

describe('wheel zoom consumption', () => {
  it('passes no cursor override for a plain wheel on the main pane', () => {
    const { handler, zoom } = wheelRig(WidgetNameConstants.MAIN)
    expect(handler.mouseWheelVertEvent({ x: 305, y: 20 } as MouseTouchEvent, 0.5)).toBe(true)
    expect(zoom).toHaveBeenCalledWith(0.5, { x: 300, y: 20 }, 'main', false)
  })

  it('forces the cursor anchor with Meta on the main pane', () => {
    const { handler, zoom } = wheelRig(WidgetNameConstants.MAIN)
    handler.mouseWheelVertEvent({ x: 305, y: 20, metaKey: true } as MouseTouchEvent, 0.5)
    expect(zoom).toHaveBeenCalledWith(0.5, { x: 300, y: 20 }, 'main', true)
  })

  it('forces the cursor anchor with Ctrl on the main pane', () => {
    const { handler, zoom } = wheelRig(WidgetNameConstants.MAIN)
    handler.mouseWheelVertEvent({ x: 305, y: 20, ctrlKey: true } as MouseTouchEvent, 0.5)
    expect(zoom).toHaveBeenCalledWith(0.5, { x: 300, y: 20 }, 'main', true)
  })

  it('zooms the time axis around its right edge', () => {
    const { handler, zoom } = wheelRig(WidgetNameConstants.X_AXIS)
    expect(handler.mouseWheelVertEvent({ x: 305, y: 20 } as MouseTouchEvent, 0.5)).toBe(true)
    expect(zoom).toHaveBeenCalledWith(0.5, { x: 1100 }, 'xAxis', false)
  })

  it('zooms the time axis at the cursor with Meta', () => {
    const { handler, zoom } = wheelRig(WidgetNameConstants.X_AXIS)
    handler.mouseWheelVertEvent({ x: 305, y: 20, metaKey: true } as MouseTouchEvent, 0.5)
    expect(zoom).toHaveBeenCalledWith(0.5, { x: 300 }, 'xAxis', true)
  })
})
