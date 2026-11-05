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

import { describe, expect, it, vi } from 'vitest'
import type { TooltipLegend } from '../common/Styles'
import CandleTooltipView from '../view/CandleTooltipView'

interface DrawRig {
  view: CandleTooltipView
  rectDraw: ReturnType<typeof vi.fn>
}

/** `drawImp` only needs these collaborators; the draw helpers are spies. */
function drawRig(showRule: string): DrawRig {
  const chartStore = {
    getCrosshair: () => ({ kLineData: { timestamp: 0 }, paneId: 'candle_pane', dataIndex: 1 }),
    getStyles: () => ({
      candle: { tooltip: { showRule, showType: 'rect', offsetTop: 0 } },
      indicator: { tooltip: { showRule: 'always', showType: 'rect' } }
    })
  }
  const widget = {
    getBounding: () => ({ width: 100, height: 100 }),
    getPane: () => ({ getChart: () => ({ getChartStore: () => chartStore }) })
  }
  const rectDraw = vi.fn()
  const view = Object.create(CandleTooltipView.prototype) as CandleTooltipView
  Object.assign(view, {
    getWidget: () => widget,
    isDrawTooltip: () => true,
    _drawRectTooltip: rectDraw,
    _drawCandleStandardTooltip: vi.fn(() => 0),
    drawIndicatorTooltip: vi.fn(() => 0)
  })
  return { view, rectDraw }
}

interface LegendsRig {
  formatPrices: ReturnType<typeof vi.fn>
  format: ReturnType<typeof vi.fn>
  legends: () => TooltipLegend[]
}

function legendsRig(respond: (values: string[]) => string[]): LegendsRig {
  const formatPrices = vi.fn(respond)
  const format = vi.fn((value: string) => value)
  const template: TooltipLegend[] = [
    { title: 'O', value: '{open}' },
    { title: 'H', value: '{high}' },
    { title: 'L', value: '{low}' },
    { title: 'C', value: '{close}' },
    { title: 'V', value: '{volume}' }
  ]
  const chartStore = {
    getStyles: () => ({
      candle: {
        tooltip: { legend: { color: '#fff', defaultValue: '--', template }, showRule: 'always' },
        priceMark: { last: { noChangeColor: '#fff', upColor: '#f00', downColor: '#0f0' } }
      }
    }),
    getDataList: () => [
      { timestamp: 0, open: 1, high: 2, low: 0.5, close: 1.5, volume: 100, turnover: 10 },
      { timestamp: 1, open: 1.1, high: 2.1, low: 0.6, close: 1.6, volume: 200, turnover: 20 }
    ],
    getInnerFormatter: () => ({ formatDate: () => 'when', formatBigNumber: (value: string) => value }),
    getDecimalFold: () => ({ format, formatAll: (values: string[]) => values, formatPrice: (value: string) => value, formatPrices }),
    getThousandsSeparator: () => ({ format: (value: string) => value }),
    getLocale: () => 'en-US',
    getSymbol: () => ({ pricePrecision: 2, volumePrecision: 0 }),
    getPeriod: () => ({ type: 'minute', span: 1 }),
    getCrosshair: () => ({ dataIndex: 1 })
  }
  const widget = { getPane: () => ({ getChart: () => ({ getChartStore: () => chartStore }) }) }
  const view = Object.create(CandleTooltipView.prototype) as CandleTooltipView
  Object.assign(view, { getWidget: () => widget })
  return {
    formatPrices,
    format,
    legends: () => (view as unknown as { _getCandleTooltipLegends: () => TooltipLegend[] })._getCandleTooltipLegends()
  }
}

describe('candle tooltip showRule', () => {
  it('skips the whole candle-pane tooltip when showRule is none', () => {
    const { view, rectDraw } = drawRig('none')
    view.drawImp({} as CanvasRenderingContext2D)
    expect(rectDraw).not.toHaveBeenCalled()
  })

  it('still draws the candle tooltip under another show rule', () => {
    const { view, rectDraw } = drawRig('always')
    view.drawImp({} as CanvasRenderingContext2D)
    expect(rectDraw).toHaveBeenCalledOnce()
  })
})

describe('candle tooltip OHLC formatting', () => {
  it('folds O/H/L/C as one group through formatPrices', () => {
    const { formatPrices, format, legends } = legendsRig((values) => values.map((value) => `fold:${value}`))
    const result = legends()
    expect(formatPrices).toHaveBeenCalledOnce()
    expect(formatPrices).toHaveBeenCalledWith(['1.10', '2.10', '0.60', '1.60'])
    expect(result.map((legend) => (legend.value as { text: string }).text)).toEqual(['fold:1.10', 'fold:2.10', 'fold:0.60', 'fold:1.60', '200'])
    // `format` is still used for volume and turnover, which are not prices.
    expect(format).toHaveBeenCalledTimes(2)
  })

  it('lets the host formatter decide the whole group', () => {
    const { legends } = legendsRig(() => ['a', 'b', 'c', 'd'])
    expect(
      legends()
        .slice(0, 4)
        .map((legend) => (legend.value as { text: string }).text)
    ).toEqual(['a', 'b', 'c', 'd'])
  })
})
