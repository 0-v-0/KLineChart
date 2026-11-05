import { beforeAll, describe, expect, it, vi } from 'vitest'

import type ChartImp from '../Chart'
import type Crosshair from '../common/Crosshair'
import type { KLineData } from '../common/Data'
import { PaneIdConstants } from '../pane/types'
import ChartStore from '../Store'

let ChartCtor: typeof ChartImp

beforeAll(async () => {
  vi.stubGlobal('window', { navigator: { userAgent: 'Linux' } })
  ChartCtor = (await import('../Chart')).default
})

interface Rig {
  store: ChartStore
  updatePane: ReturnType<typeof vi.fn>
  executeAction: ReturnType<typeof vi.fn>
  getDrawPaneById: ReturnType<typeof vi.fn>
  data: KLineData[]
}

function bar(index: number): KLineData {
  return { timestamp: index * 1000, open: 100, high: 110, low: 90, close: 105, volume: 1 }
}

function createRig(mode: 'normal' | 'weak' | 'strong' = 'normal', withAxis = true): Rig {
  const updatePane = vi.fn()
  const executeAction = vi.fn()
  const axis = { convertToPixel: (value: number) => 200 - value }
  const getDrawPaneById = vi.fn((_id: string) => (withAxis ? { getYAxisComponentById: () => axis } : null))
  const data = [bar(0), bar(1), bar(2)]
  const store = Object.assign(Object.create(ChartStore.prototype) as object, {
    _magnetMode: mode,
    _crosshair: {},
    _dataList: data,
    _chart: { updatePane, getDrawPaneById },
    coordinateToDataIndex: (x: number) => Math.floor(x / 10),
    dataIndexToCoordinate: (index: number) => index * 10 + 5,
    dataIndexToTimestamp: (index: number) => index * 1000,
    hasAction: () => true,
    executeAction
  }) as unknown as ChartStore
  return { store, updatePane, executeAction, getDrawPaneById, data }
}

const pointer = (paneId: string = PaneIdConstants.CANDLE): Crosshair => ({ x: 12, y: 92, paneId })

describe('crosshair magnet mode', () => {
  it('defaults to normal and round-trips the mode', () => {
    const { store } = createRig()
    expect(store.getMagnetMode()).toBe('normal')
    store.setMagnetMode('strong')
    expect(store.getMagnetMode()).toBe('strong')
    store.setMagnetMode('normal')
    expect(store.getMagnetMode()).toBe('normal')
  })

  it('does not recompute the crosshair when the mode is unchanged', () => {
    const { store } = createRig()
    const spy = vi.spyOn(store, 'setCrosshair')
    store.setMagnetMode('normal')
    expect(spy).not.toHaveBeenCalled()
  })

  it('recomputes the current crosshair when the mode changes', () => {
    const { store } = createRig()
    const previous = store.getCrosshair()
    const spy = vi.spyOn(store, 'setCrosshair')
    store.setMagnetMode('weak')
    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy.mock.calls[0][0]).toBe(previous)
    expect(spy.mock.calls[0][1]).toEqual({ forceInvalidate: true })
  })

  it('leaves the pointer alone in normal mode', () => {
    const { store } = createRig('normal')
    const input = pointer()
    store.setCrosshair(input)
    expect(store.getCrosshair().x).toBe(12)
    expect(store.getCrosshair().y).toBe(92)
  })

  it('snaps X to the bar centre in weak mode', () => {
    const { store, data } = createRig('weak')
    store.setCrosshair(pointer())
    const crosshair = store.getCrosshair()
    expect(crosshair.x).toBe(15)
    expect(crosshair.realX).toBe(15)
    expect(crosshair.y).toBe(92)
    expect(crosshair.kLineData).toBe(data[1])
    expect(crosshair.dataIndex).toBe(1)
    expect(crosshair.timestamp).toBe(1000)
  })

  it('snaps Y to the nearest OHLC on the candle pane in strong mode', () => {
    const { store } = createRig('strong')
    store.setCrosshair(pointer())
    // open 100 -> 100px, high 110 -> 90px, low 90 -> 110px, close 105 -> 95px
    expect(store.getCrosshair().x).toBe(15)
    expect(store.getCrosshair().y).toBe(90)
  })

  it('only snaps X outside the candle pane', () => {
    const { store } = createRig('strong')
    store.setCrosshair(pointer('indicator_pane_1'))
    expect(store.getCrosshair().x).toBe(15)
    expect(store.getCrosshair().y).toBe(92)
  })

  it('does not snap without a pointer x', () => {
    const { store } = createRig('strong')
    store.setCrosshair({ y: 92, paneId: PaneIdConstants.CANDLE })
    expect(store.getCrosshair().x).toBeUndefined()
    expect(store.getCrosshair().y).toBe(92)
  })

  it('keeps the pointer y when the pane has no axis', () => {
    const { store } = createRig('strong', false)
    store.setCrosshair(pointer())
    expect(store.getCrosshair().x).toBe(15)
    expect(store.getCrosshair().y).toBe(92)
  })

  it('reports the raw pointer through onCrosshairChange', () => {
    const { store, executeAction } = createRig('strong')
    const input = pointer()
    store.setCrosshair(input)
    expect(executeAction).toHaveBeenCalledTimes(1)
    expect(executeAction.mock.calls[0][0]).toBe('onCrosshairChange')
    expect(executeAction.mock.calls[0][1]).toBe(input)
  })

  it('delegates the Chart API to the store', () => {
    const chartStore = { setMagnetMode: vi.fn(), getMagnetMode: vi.fn(() => 'weak') }
    const chart = Object.assign(Object.create(ChartCtor.prototype) as object, { _chartStore: chartStore }) as unknown as ChartImp
    chart.setMagnetMode('strong')
    expect(chartStore.setMagnetMode).toHaveBeenCalledWith('strong')
    expect(chart.getMagnetMode()).toBe('weak')
    expect(chartStore.getMagnetMode).toHaveBeenCalledTimes(1)
  })
})
