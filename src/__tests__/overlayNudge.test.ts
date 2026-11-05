import { describe, expect, it, vi } from 'vitest'

import type Chart from '../Chart'
import type { KLineData } from '../common/Data'
import type { DataLoader, DataLoaderGetBarsParams, DataLoaderGetRangeParams } from '../common/DataLoader'
import type { Period } from '../common/Period'
import type { SymbolInfo } from '../common/SymbolInfo'
import { registerOverlay } from '../extension/overlay/index'
import { PaneIdConstants } from '../pane/types'
import StoreImp from '../Store'

const HOUR_MS = 3_600_000
const BASE = Date.UTC(2026, 3, 2, 0, 0, 0)

// One price unit is 10px and y grows downward.
const axis = { convertToPixel: (v: number) => 1000 - v * 10, convertFromPixel: (p: number) => (1000 - p) / 10 }

function buildStore(): StoreImp {
  const chart = {
    layout: () => {
      /* noop */
    },
    updatePane: () => {
      /* noop */
    },
    getDrawPaneById: () => ({ getAxisComponent: () => axis })
  } as unknown as Chart
  const store = new StoreImp(chart)
  store.setSymbol({ ticker: 'AAA', pricePrecision: 2, volumePrecision: 0 } as SymbolInfo)
  store.setPeriod({ type: 'hour', span: 1 } satisfies Period)
  const data: KLineData[] = []
  for (let i = 0; i < 10; i++) {
    data.push({ timestamp: BASE + i * HOUR_MS, open: 100, high: 101, low: 99, close: 100, volume: 1 })
  }
  const loader: DataLoader = {
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
  store.setDataLoader(loader)
  return store
}

function addSegment(store: StoreImp, lock = false): string {
  registerOverlay({ name: 'nudge-test', totalStep: 3, createPointFigures: () => [] })
  const list = store.getDataList()
  const [id] = store.addOverlays(
    [
      {
        name: 'nudge-test',
        paneId: PaneIdConstants.CANDLE,
        lock,
        points: [
          { timestamp: list[2].timestamp, dataIndex: 2, value: 100 },
          { timestamp: list[4].timestamp, dataIndex: 4, value: 110 }
        ]
      }
    ],
    [false]
  )
  return id as string
}

describe('nudgeOverlays', () => {
  it('moves every point exactly one bar, keeping timestamp and dataIndex in step', () => {
    const store = buildStore()
    const id = addSegment(store)
    expect(store.nudgeOverlays([id], 'right')).toBe(true)
    const [a, b] = store.getOverlaysByFilter({ id })[0].points
    expect([a.dataIndex, b.dataIndex]).toEqual([3, 5])
    expect([a.timestamp, b.timestamp]).toEqual([BASE + 3 * HOUR_MS, BASE + 5 * HOUR_MS])
  })

  it('moves vertically by a fixed pixel distance, up raising the price', () => {
    const store = buildStore()
    const id = addSegment(store)
    expect(store.nudgeOverlays([id], 'up')).toBe(true)
    const [a] = store.getOverlaysByFilter({ id })[0].points
    expect(a.value).toBeGreaterThan(100)
    expect(axis.convertToPixel(a.value as number)).toBeCloseTo(axis.convertToPixel(100) - 4)
  })

  it('skips locked drawings and reports nothing moved', () => {
    const store = buildStore()
    const id = addSegment(store, true)
    expect(store.nudgeOverlays([id], 'left')).toBe(false)
    expect(store.getOverlaysByFilter({ id })[0].points[0].dataIndex).toBe(2)
  })

  it('fires onPressedMoveEnd for each drawing that moved', () => {
    const store = buildStore()
    const id = addSegment(store)
    const onPressedMoveEnd = vi.fn()
    store.getOverlaysByFilter({ id })[0].onPressedMoveEnd = onPressedMoveEnd
    store.nudgeOverlays([id], 'down')
    expect(onPressedMoveEnd).toHaveBeenCalledTimes(1)
  })
})
