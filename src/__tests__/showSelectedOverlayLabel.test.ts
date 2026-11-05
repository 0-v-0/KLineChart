/**
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at

 * http://www.apache.org/licenses/LICENSE-2.0

 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { beforeAll, describe, expect, it, vi } from 'vitest'
import type Chart from '../Chart'
import type ChartImp from '../Chart'
import type Coordinate from '../common/Coordinate'
import type { Overlay, OverlayFigure } from '../component/Overlay'
import ChartStore from '../Store'
import OverlayXAxisView from '../view/OverlayXAxisView'
import OverlayYAxisView from '../view/OverlayYAxisView'

let ChartCtor: typeof ChartImp

beforeAll(async () => {
  vi.stubGlobal('window', { navigator: { userAgent: 'Linux' }, getComputedStyle: () => ({ backgroundColor: '' }) })
  ChartCtor = (await import('../Chart')).default
})

function mockChart(): Chart {
  return { layout: () => undefined, updatePane: () => undefined } as unknown as Chart
}

interface AxisRig {
  state: { show: boolean }
  yView: OverlayYAxisView
  xView: OverlayXAxisView
  overlay: Overlay
  coordinates: Coordinate[]
}

function axisRig(show = true): AxisRig {
  const state = { show }
  const chartStore = {
    getShowSelectedOverlayLabel: () => state.show,
    getClickOverlayInfo: () => ({ paneId: 'candle_pane', overlay: { id: 'o1' }, figureType: 'point', figureIndex: 0, figure: null }),
    getDecimalFold: () => ({ threshold: 4, format: (value: string) => value, formatAll: (values: string[]) => values, formatPrice: (value: string) => value, formatPrices: (values: string[]) => values }),
    getThousandsSeparator: () => ({ sign: ',', format: (value: string) => value }),
    getSymbol: () => ({ pricePrecision: 2 }),
    getInnerFormatter: () => ({ formatDate: () => '2026-01-01 00:00' })
  }
  const yAxis = { isFromZero: () => true, isInCandle: () => true }
  const chart = {
    getChartStore: () => chartStore,
    getStyles: () => ({ overlay: {} }),
    getXAxisPane: () => ({ getXAxisComponent: () => ({}) })
  }
  const pane = {
    getId: () => 'candle_pane',
    getChart: () => chart,
    getYAxisComponentById: () => yAxis
  }
  const widget = { getPane: () => pane, getBounding: () => ({ width: 100, height: 100 }) }
  const make = (proto: object): unknown => Object.assign(Object.create(proto) as object, { getWidget: () => widget })
  const overlay = {
    id: 'o1',
    needDefaultYAxisFigure: true,
    needDefaultXAxisFigure: true,
    points: [{ value: 100.5, timestamp: 1000 }],
    createYAxisFigures: () => [{ type: 'text', attrs: { x: 0, y: 0, text: 'y-name' }, ignoreEvent: true }],
    createXAxisFigures: () => [{ type: 'text', attrs: { x: 0, y: 0, text: 'x-name' }, ignoreEvent: true }]
  } as unknown as Overlay
  return {
    state,
    yView: make(OverlayYAxisView.prototype) as OverlayYAxisView,
    xView: make(OverlayXAxisView.prototype) as OverlayXAxisView,
    overlay,
    coordinates: [{ x: 10, y: 20 }]
  }
}

interface ViewWithFigures {
  getDefaultFigures: (overlay: Overlay, coordinates: Coordinate[]) => OverlayFigure[]
  getFigures: (overlay: Overlay, coordinates: Coordinate[]) => OverlayFigure | OverlayFigure[]
}

const asView = (view: unknown): ViewWithFigures => view as ViewWithFigures

describe('showSelectedOverlayLabel option', () => {
  it('defaults to showing the selected drawing labels', () => {
    expect(new ChartStore(mockChart()).getShowSelectedOverlayLabel()).toBe(true)
  })

  it('can be turned off at init', () => {
    expect(new ChartStore(mockChart(), { showSelectedOverlayLabel: false }).getShowSelectedOverlayLabel()).toBe(false)
    expect(new ChartStore(mockChart(), { showSelectedOverlayLabel: true }).getShowSelectedOverlayLabel()).toBe(true)
  })

  it('round-trips through the store', () => {
    const store = new ChartStore(mockChart())
    store.setShowSelectedOverlayLabel(false)
    expect(store.getShowSelectedOverlayLabel()).toBe(false)
    store.setShowSelectedOverlayLabel(true)
    expect(store.getShowSelectedOverlayLabel()).toBe(true)
  })

  it('is a public chart option that redraws when changed', () => {
    const setShowSelectedOverlayLabel = vi.fn()
    const getShowSelectedOverlayLabel = vi.fn(() => false)
    const layout = vi.fn()
    const store = { setShowSelectedOverlayLabel, getShowSelectedOverlayLabel } as unknown as ChartStore
    const chart = Object.assign(Object.create(ChartCtor.prototype) as object, { _chartStore: store, layout }) as unknown as ChartImp
    chart.setShowSelectedOverlayLabel(false)
    expect(setShowSelectedOverlayLabel).toHaveBeenCalledWith(false)
    expect(layout).toHaveBeenCalledOnce()
    expect(chart.getShowSelectedOverlayLabel()).toBe(false)
  })
})

describe('selected drawing axis labels', () => {
  it('hides the y-axis price tag and custom name tag together', () => {
    const rig = axisRig()
    const yView = asView(rig.yView)
    expect(yView.getDefaultFigures(rig.overlay, rig.coordinates)).toHaveLength(1)
    expect(yView.getFigures(rig.overlay, rig.coordinates)).toHaveLength(1)
    rig.state.show = false
    expect(yView.getDefaultFigures(rig.overlay, rig.coordinates)).toEqual([])
    expect(yView.getFigures(rig.overlay, rig.coordinates)).toEqual([])
  })

  it('hides the x-axis time tag and custom name tag together', () => {
    const rig = axisRig()
    const xView = asView(rig.xView)
    expect(xView.getDefaultFigures(rig.overlay, rig.coordinates)).toHaveLength(1)
    expect(xView.getFigures(rig.overlay, rig.coordinates)).toHaveLength(1)
    rig.state.show = false
    expect(xView.getDefaultFigures(rig.overlay, rig.coordinates)).toEqual([])
    expect(xView.getFigures(rig.overlay, rig.coordinates)).toEqual([])
  })

  it('keeps the labels when the option is on and restores them when switched back', () => {
    const rig = axisRig(false)
    const yView = asView(rig.yView)
    expect(yView.getDefaultFigures(rig.overlay, rig.coordinates)).toEqual([])
    rig.state.show = true
    const figures = yView.getDefaultFigures(rig.overlay, rig.coordinates)
    expect(figures).toHaveLength(1)
    expect((figures[0].attrs as { text: string }).text).toBe('100.50')
  })
})
