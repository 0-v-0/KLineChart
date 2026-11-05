import { afterEach, describe, expect, it, vi } from 'vitest'

import type Chart from '../Chart'
import type Bounding from '../common/Bounding'
import type { KLineData } from '../common/Data'
import type { DataLoadMore, DataLoader } from '../common/DataLoader'
import type { SymbolInfo } from '../common/SymbolInfo'
import { UpdateLevel } from '../common/Updater'
import ChartStore from '../Store'
import DrawWidget from '../widget/DrawWidget'

const HOUR_MS = 3_600_000

const bars = (count: number): KLineData[] => Array.from({ length: count }, (_, i) => ({ timestamp: i * HOUR_MS, open: 100, high: 101, low: 99, close: 100, volume: 1 }))

interface StoreRig {
  store: ChartStore
  updatePane: ReturnType<typeof vi.fn>
  fireInit: (data: KLineData[]) => void
}

function storeRig(): StoreRig {
  const updatePane = vi.fn()
  const chart = { layout: () => undefined, updatePane } as unknown as Chart
  const store = new ChartStore(chart)
  store.setSymbol({ ticker: 'AAA', pricePrecision: 2, volumePrecision: 0 } as SymbolInfo)
  store.setPeriod({ type: 'hour', span: 1 })
  let initCallback: ((data: KLineData[], more?: DataLoadMore) => void) | null = null
  const loader: DataLoader = {
    getBars: (params) => {
      if (params.type === 'init') {
        initCallback = params.callback
      }
    },
    subscribeBar: () => undefined,
    unsubscribeBar: () => undefined,
    getRange: (params) => {
      params.callback([])
    }
  }
  store.setDataLoader(loader)
  return {
    store,
    updatePane,
    fireInit: (data: KLineData[]) => {
      initCallback?.(data, { backward: false, forward: false })
    }
  }
}

afterEach(() => {
  vi.useRealTimers()
})

describe('period switch overlay gate', () => {
  it('opens the gate on setPeriod and closes it when init data arrives', () => {
    const { store, fireInit } = storeRig()
    expect(store.isPeriodSwitchPending()).toBe(false)

    store.setPeriod({ type: 'minute', span: 1 })
    expect(store.isPeriodSwitchPending()).toBe(true)

    fireInit(bars(10))
    expect(store.isPeriodSwitchPending()).toBe(false)
    expect(store.getDataList()).toHaveLength(10)
  })

  it('does not hide overlays forever when no init can load', () => {
    const updatePane = vi.fn()
    const chart = { layout: () => undefined, updatePane } as unknown as Chart
    const store = new ChartStore(chart)
    store.setSymbol({ ticker: 'AAA', pricePrecision: 2, volumePrecision: 0 } as SymbolInfo)
    store.setPeriod({ type: 'hour', span: 1 })

    expect(store.isPeriodSwitchPending()).toBe(false)
  })

  it('falls back after ten seconds and repaints the overlay pane', () => {
    vi.useFakeTimers()
    const { store, updatePane } = storeRig()
    store.setPeriod({ type: 'minute', span: 1 })
    expect(store.isPeriodSwitchPending()).toBe(true)
    const callsBefore = updatePane.mock.calls.length

    vi.advanceTimersByTime(10000)

    expect(store.isPeriodSwitchPending()).toBe(false)
    expect(updatePane.mock.calls.length).toBeGreaterThan(callsBefore)
    expect(updatePane.mock.calls[updatePane.mock.calls.length - 1][0]).toBe(UpdateLevel.Overlay)
  })

  it('clears the fallback timer on destroy', () => {
    vi.useFakeTimers()
    const { store } = storeRig()
    const before = vi.getTimerCount()
    store.setPeriod({ type: 'minute', span: 1 })
    expect(vi.getTimerCount()).toBe(before + 1)

    store.destroy()

    expect(vi.getTimerCount()).toBe(before)
    expect(store.isPeriodSwitchPending()).toBe(false)
  })
})

interface WidgetRig {
  widget: DrawWidget
  main: ReturnType<typeof vi.fn>
  overlay: ReturnType<typeof vi.fn>
  setPending: (pending: boolean) => void
}

function widgetRig(): WidgetRig {
  let pending = true
  const main = vi.fn()
  const overlay = vi.fn()
  const widget = Object.assign(Object.create(DrawWidget.prototype) as object, {
    _mainCanvas: { update: main },
    _overlayCanvas: { update: overlay },
    getPane: () => ({
      getChart: () => ({ getChartStore: () => ({ isPeriodSwitchPending: () => pending }) })
    })
  }) as unknown as DrawWidget
  return {
    widget,
    main,
    overlay,
    setPending: (value: boolean) => {
      pending = value
    }
  }
}

const container = (): HTMLElement => ({ style: {}, clientWidth: 100, clientHeight: 50 }) as unknown as HTMLElement
const bounding = (width = 100, height = 50): Bounding => ({ width, height, left: 0 }) as Bounding

describe('DrawWidget frozen overlay', () => {
  it('skips the overlay repaint while the gate is open', () => {
    const { widget, main, overlay } = widgetRig()
    widget.updateImp(container(), bounding(), UpdateLevel.Overlay)
    expect(overlay).not.toHaveBeenCalled()
    expect(main).not.toHaveBeenCalled()
  })

  it('repaints the overlay once the gate closes', () => {
    const { widget, overlay, setPending } = widgetRig()
    setPending(false)
    widget.updateImp(container(), bounding(), UpdateLevel.Overlay)
    expect(overlay).toHaveBeenCalledWith(100, 50)
  })

  it('still repaints the main canvas', () => {
    const { widget, main, overlay } = widgetRig()
    widget.updateImp(container(), bounding(), UpdateLevel.Main)
    expect(main).toHaveBeenCalledWith(100, 50)
    expect(overlay).not.toHaveBeenCalled()
  })

  it('lets a resize through even while the gate is open', () => {
    const { widget, main, overlay } = widgetRig()
    widget.updateImp(container(), bounding(200, 50), UpdateLevel.Overlay)
    expect(main).toHaveBeenCalledWith(200, 50)
    expect(overlay).toHaveBeenCalledWith(200, 50)
  })
})
