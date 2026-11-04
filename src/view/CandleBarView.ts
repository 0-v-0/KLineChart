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

import type BarSpace from '../common/BarSpace'
import type { VisibleRangeData } from '../common/Data'
import type { MouseTouchEvent } from '../common/EventHandler'
import type Nullable from '../common/Nullable'
import RectBatch from '../common/RectBatch'
import type { CandleBarColor, CandleBarColorCallback, CandleType } from '../common/Styles'
import { isFunction, isValid } from '../common/utils/typeChecks'

import { checkCoordinateOnRect, type RectAttrs } from '../extension/figure/rect'
import type DrawPane from '../pane/DrawPane'
import { PaneIdConstants } from '../pane/types'
import type { YAxis } from '../component/YAxis'
import type DrawWidget from '../widget/DrawWidget'
import ChildrenView from './ChildrenView'

export interface CandleBarOptions {
  yAxisId: string
  type: Exclude<CandleType, 'area'>
  styles: CandleBarColor | CandleBarColorCallback
}

/**
 * One colour's worth of rectangles within a bar, at one depth: index 0 is the
 * wick and index 1 the body, which is the order they have to paint in. A
 * `null` colour means that pass is skipped — a stroke-only body has no fill.
 */
interface BarLayer {
  attrs: RectAttrs[]
  color: Nullable<string>
  borderColor: Nullable<string>
}

export default class CandleBarView extends ChildrenView {
  /**
   * The main pane's bars as drawn, for `onCandleBarClick`. Bars paint through
   * one batched path per colour rather than as figures, so the view hit-tests
   * them itself instead of through a child figure per bar.
   */
  private _barHits: Array<{ rects: RectAttrs[]; data: VisibleRangeData }> = []

  private _clickedBar: Nullable<VisibleRangeData> = null

  constructor(widget: DrawWidget<DrawPane<YAxis>>) {
    super(widget)
    this.registerEvent('mouseClickEvent', () => {
      const clicked = this._clickedBar
      this._clickedBar = null
      if (clicked !== null) {
        this.getWidget().getPane().getChart().getChartStore().executeAction('onCandleBarClick', clicked)
      }
      return false
    })
  }

  override checkEventOn(event: MouseTouchEvent): boolean {
    this._clickedBar = null
    // Last drawn first, as children were dispatched.
    for (let i = this._barHits.length - 1; i > -1; i--) {
      if (checkCoordinateOnRect(event, this._barHits[i].rects)) {
        this._clickedBar = this._barHits[i].data
        return true
      }
    }
    return false
  }

  override drawImp(ctx: CanvasRenderingContext2D): void {
    this._barHits = []
    const pane = this.getWidget().getPane()
    const isMain = pane.getId() === PaneIdConstants.CANDLE
    const chartStore = pane.getChart().getChartStore()
    const candleBarOptions = this.getCandleBarOptions()
    if (candleBarOptions !== null) {
      const { type, styles } = candleBarOptions
      let ohlcSize = 0
      let halfOhlcSize = 0
      if (candleBarOptions.type === 'ohlc') {
        const { gapBar } = chartStore.getBarSpace()
        ohlcSize = Math.min(Math.max(Math.round(gapBar * 0.2), 1), 8)
        if (ohlcSize > 2 && ohlcSize % 2 === 1) {
          ohlcSize--
        }
        halfOhlcSize = Math.floor(ohlcSize / 2)
      }
      const yAxis = pane.getAxisComponent()
      const batch = new RectBatch()
      this.eachChildren((visibleData, barSpace) => {
        const {
          x,
          data: { current, prev }
        } = visibleData
        if (isValid(current)) {
          const { open, high, low, close } = current
          const colors: string[] = []
          if (isFunction<CandleBarColorCallback>(styles)) {
            const result = styles(visibleData.data)
            colors[0] = result.color
            colors[1] = result.borderColor
            colors[2] = result.wickColor
          } else {
            const comparePrice = styles.compareRule === 'current_open' ? open : (prev?.close ?? close)
            if (close > comparePrice) {
              colors[0] = styles.upColor
              colors[1] = styles.upBorderColor
              colors[2] = styles.upWickColor
            } else if (close < comparePrice) {
              colors[0] = styles.downColor
              colors[1] = styles.downBorderColor
              colors[2] = styles.downWickColor
            } else {
              colors[0] = styles.noChangeColor
              colors[1] = styles.noChangeBorderColor
              colors[2] = styles.noChangeWickColor
            }
          }
          const openY = yAxis.convertToPixel(open)
          const closeY = yAxis.convertToPixel(close)
          const priceY = [openY, closeY, yAxis.convertToPixel(high), yAxis.convertToPixel(low)]
          priceY.sort((a, b) => a - b)

          const correction = barSpace.gapBar % 2 === 0 ? 1 : 0
          let layers: BarLayer[] = []
          switch (type) {
            case 'candle_solid':
            case 'heikin_ashi': {
              layers = this._createSolidBar(x, priceY, barSpace, colors, correction)
              break
            }
            case 'candle_stroke': {
              layers = this._createStrokeBar(x, priceY, barSpace, colors, correction)
              break
            }
            case 'candle_up_stroke': {
              if (close > open) {
                layers = this._createStrokeBar(x, priceY, barSpace, colors, correction)
              } else {
                layers = this._createSolidBar(x, priceY, barSpace, colors, correction)
              }
              break
            }
            case 'candle_down_stroke': {
              if (open > close) {
                layers = this._createStrokeBar(x, priceY, barSpace, colors, correction)
              } else {
                layers = this._createSolidBar(x, priceY, barSpace, colors, correction)
              }
              break
            }
            case 'ohlc': {
              layers = [
                {
                  attrs: [
                    {
                      x: x - halfOhlcSize,
                      y: priceY[0],
                      width: ohlcSize,
                      height: priceY[3] - priceY[0]
                    },
                    {
                      x: x - barSpace.halfGapBar,
                      y: openY + ohlcSize > priceY[3] ? priceY[3] - ohlcSize : openY,
                      width: barSpace.halfGapBar - halfOhlcSize,
                      height: ohlcSize
                    },
                    {
                      x: x + halfOhlcSize,
                      y: closeY + ohlcSize > priceY[3] ? priceY[3] - ohlcSize : closeY,
                      width: barSpace.halfGapBar - halfOhlcSize,
                      height: ohlcSize
                    }
                  ],
                  color: colors[0],
                  borderColor: null
                }
              ]
              break
            }
          }
          const hitRects: RectAttrs[] = []
          for (let layer = 0; layer < layers.length; layer++) {
            const { attrs, color, borderColor } = layers[layer]
            for (const r of attrs) {
              const filled = color !== null && batch.fill(layer, color, r)
              if (borderColor !== null) {
                batch.stroke(layer, borderColor, r, filled ? color : null)
              }
              if (isMain) {
                hitRects.push(r)
              }
            }
          }
          if (isMain) {
            this._barHits.push({ rects: hitRects, data: visibleData })
          }
        }
      }, true)
      batch.draw(ctx)
    }
  }

  protected getCandleBarOptions(): Nullable<CandleBarOptions> {
    const pane = this.getWidget().getPane()
    const yAxisId = pane.getDefaultYAxisId()
    if (!isValid(yAxisId)) {
      return null
    }
    const candleStyles = pane.getChart().getStyles().candle
    return {
      yAxisId,
      type: candleStyles.type as Exclude<CandleType, 'area'>,
      styles: candleStyles.bar
    }
  }

  private _createSolidBar(x: number, priceY: number[], barSpace: BarSpace, colors: string[], correction: number): BarLayer[] {
    return [
      {
        attrs: [{ x, y: priceY[0], width: 1, height: priceY[3] - priceY[0] }],
        color: colors[2],
        borderColor: null
      },
      {
        attrs: [{ x: x - barSpace.halfGapBar, y: priceY[1], width: barSpace.gapBar + correction, height: Math.max(1, priceY[2] - priceY[1]) }],
        color: colors[0],
        borderColor: colors[1]
      }
    ]
  }

  private _createStrokeBar(x: number, priceY: number[], barSpace: BarSpace, colors: string[], correction: number): BarLayer[] {
    return [
      {
        attrs: [
          { x, y: priceY[0], width: 1, height: priceY[1] - priceY[0] },
          { x, y: priceY[2], width: 1, height: priceY[3] - priceY[2] }
        ],
        color: colors[2],
        borderColor: null
      },
      {
        attrs: [{ x: x - barSpace.halfGapBar, y: priceY[1], width: barSpace.gapBar + correction, height: Math.max(1, priceY[2] - priceY[1]) }],
        color: null,
        borderColor: colors[1]
      }
    ]
  }
}
