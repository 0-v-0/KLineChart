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
import { type FootprintBarData, type FootprintLayout, formatFootprintVolume, footprintImbalances, footprintLayout, footprintValueArea } from '../common/Footprint'
import RectBatch from '../common/RectBatch'
import type { CandleBarColor, CandleBarColorCallback, CandleFootprintStyle, CandleLineSeriesType, CandleType } from '../common/Styles'
import { createFont } from '../common/utils/canvas'
import { isFunction, isValid } from '../common/utils/typeChecks'

import { checkCoordinateOnRect, type RectAttrs } from '../extension/figure/rect'
import type DrawPane from '../pane/DrawPane'
import { PaneIdConstants } from '../pane/types'
import type { YAxis } from '../component/YAxis'
import type DrawWidget from '../widget/DrawWidget'
import ChildrenView from './ChildrenView'

export interface CandleBarOptions {
  yAxisId: string
  /** Neither the area series nor a line series ever reaches this view. */
  type: Exclude<CandleType, 'area' | CandleLineSeriesType>
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

/**
 * The scale a footprint frame is drawn against, measured over the bars on
 * screen rather than per bar: a cell's opacity, and how far a delta column
 * reaches, only mean something next to its neighbours. `null` when the chart is
 * not a footprint, or when the bars are too narrow to carry one.
 */
interface FootprintFrame {
  style: CandleFootprintStyle
  /** Largest bid or ask cell on screen. */
  maxCell: number
  /** Largest |ask - bid| row on screen. */
  maxDelta: number
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
      const boundingHeight = this.getWidget().getBounding().height
      const footprint = this._createFootprintFrame(type, isMain)
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
            // These two have no open-to-close body, so their direction is the
            // day's move rather than the bar's own shape.
            const comparePrice = type === 'column' || type === 'high_low' ? (prev?.close ?? open) : styles.compareRule === 'current_open' ? open : (prev?.close ?? close)
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
          // A host's colour for this bar wins outright, body and wick: it was
          // asked for by bar, so it beats both the fixed style and the up/down
          // rule. Only the candle pane: an indicator's bar is not a bar.
          const barColor = isMain ? chartStore.getBarColor(current) : null
          if (isValid(barColor)) {
            colors.fill(barColor)
          }
          const openY = yAxis.convertToPixel(open)
          const closeY = yAxis.convertToPixel(close)
          const priceY = [openY, closeY, yAxis.convertToPixel(high), yAxis.convertToPixel(low)]
          priceY.sort((a, b) => a - b)

          const correction = barSpace.gapBar % 2 === 0 ? 1 : 0
          let layers: BarLayer[] = []
          const footprintData = footprint === null ? null : chartStore.getFootprint(current)
          if (footprint !== null && footprintData !== null && footprintData.rows.length > 0) {
            const layout = footprintLayout(barSpace.gapBar, footprint.style.variant)
            this._drawFootprint(ctx, x, barSpace, layout, footprintData, footprint)
            layers = this._createFootprintBody(x, priceY, barSpace, layout, colors)
          } else {
            switch (type) {
              case 'footprint':
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
              case 'column': {
                // A column runs from the close down to the floor of the pane.
                layers = [{ attrs: [{ x: x - barSpace.halfGapBar, y: closeY, width: barSpace.gapBar + correction, height: Math.max(1, boundingHeight - closeY) }], color: colors[0], borderColor: null }]
                break
              }
              case 'high_low': {
                layers = [{ attrs: [{ x: x - barSpace.halfGapBar, y: priceY[0], width: barSpace.gapBar + correction, height: Math.max(1, priceY[3] - priceY[0]) }], color: colors[0], borderColor: null }]
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
      type: candleStyles.type as Exclude<CandleType, 'area' | CandleLineSeriesType>,
      styles: candleStyles.bar
    }
  }

  /**
   * The frame every footprint bar on screen is drawn against, or `null` when
   * this is not a footprint — or when the bars are narrower than the style's
   * floor, at which point the whole chart is candles again.
   */
  private _createFootprintFrame(type: CandleBarOptions['type'], isMain: boolean): Nullable<FootprintFrame> {
    if (type !== 'footprint' || !isMain) {
      return null
    }
    const chart = this.getWidget().getPane().getChart()
    const chartStore = chart.getChartStore()
    const style = chart.getStyles().candle.footprint
    if (chartStore.getBarSpace().gapBar < style.minBarWidth) {
      return null
    }
    let maxCell = 0
    let maxDelta = 0
    for (const {
      data: { current }
    } of chartStore.getVisibleRangeDataList()) {
      if (!isValid(current)) {
        continue
      }
      const bar = chartStore.getFootprint(current)
      if (bar === null) {
        continue
      }
      for (const [, bid, ask] of bar.rows) {
        maxCell = Math.max(maxCell, bid, ask)
        maxDelta = Math.max(maxDelta, Math.abs(ask - bid))
      }
    }
    return { style, maxCell, maxDelta }
  }

  /** The thin OHLC body a footprint bar keeps on its left edge, before its cells. */
  private _createFootprintBody(x: number, priceY: number[], barSpace: BarSpace, layout: FootprintLayout, colors: string[]): BarLayer[] {
    const left = x - barSpace.halfGapBar
    const width = layout.bodyWidth
    const wickX = left + Math.floor(width / 2)
    return [
      {
        attrs: [{ x: wickX, y: priceY[0], width: 1, height: priceY[3] - priceY[0] }],
        color: colors[2],
        borderColor: null
      },
      {
        // No border: at a few pixels wide the outline would be the whole body.
        attrs: [{ x: left, y: priceY[1], width, height: Math.max(1, priceY[2] - priceY[1]) }],
        color: colors[0],
        borderColor: null
      }
    ]
  }

  private _drawFootprint(ctx: CanvasRenderingContext2D, x: number, barSpace: BarSpace, layout: FootprintLayout, data: FootprintBarData, frame: FootprintFrame): void {
    if (layout.mode === 'histogram') {
      this._drawFootprintHistogram(ctx, x, barSpace, layout, data, frame.style)
      return
    }
    const { style, maxCell, maxDelta } = frame
    const yAxis = this.getWidget().getPane().getAxisComponent()
    const left = x - barSpace.halfGapBar + layout.bodyWidth + layout.gap
    const areaWidth = Math.max(1, barSpace.gapBar - layout.bodyWidth - layout.gap)
    const columnWidth = layout.mode === 'split' ? Math.max(1, Math.floor(areaWidth / 2)) : areaWidth
    const { rowSize, rows, poc } = data
    const imbalances = footprintImbalances(rows, rowSize, style.imbalanceRatio)
    const font = createFont(style.textSize, 'normal', style.textFamily)
    const boldFont = createFont(style.textSize, 'bold', style.textFamily)
    // A number is drawn only where it fits at full size, never squeezed.
    const fits = (text: string, width: number): boolean => ctx.measureText(text).width <= width - 3
    const barMax = layout.mode === 'profile' ? rows.reduce((m, [, bid, ask]) => Math.max(m, bid + ask), 0) : 0

    ctx.save()
    // Earlier figures (dashed grid, price lines) can leave a dash pattern set.
    ctx.setLineDash([])
    ctx.textBaseline = 'middle'
    ctx.textAlign = 'center'
    rows.forEach(([price, bid, ask], i) => {
      const top = Math.round(yAxis.convertToPixel(price + rowSize))
      const bottom = Math.round(yAxis.convertToPixel(price))
      const height = Math.max(1, bottom - top)
      const tallEnough = style.showNumbers && height >= style.textSize + 2
      const inset = height > 3 ? 1 : 0

      if (layout.mode === 'split') {
        const cells: Array<[number, number, string, boolean, string]> = [
          [left, bid, style.bidColor, imbalances.bid.has(i), style.imbalanceBidColor],
          [left + columnWidth, ask, style.askColor, imbalances.ask.has(i), style.imbalanceAskColor]
        ]
        cells.forEach(([cellX, volume, color, imbalance, imbalanceColor]) => {
          if (volume > 0) {
            ctx.globalAlpha = maxCell > 0 ? 0.12 + 0.68 * (volume / maxCell) : 0.12
            ctx.fillStyle = color
            ctx.fillRect(cellX, top, Math.max(1, columnWidth - 1), height - inset)
            ctx.globalAlpha = 1
          }
          if (imbalance && columnWidth >= 6 && height >= 4) {
            ctx.strokeStyle = imbalanceColor
            ctx.lineWidth = 1
            ctx.strokeRect(cellX + 0.5, top + 0.5, columnWidth - 2, height - 2)
          }
          if (tallEnough) {
            ctx.font = imbalance ? boldFont : font
            const text = formatFootprintVolume(volume)
            if (fits(text, columnWidth)) {
              ctx.fillStyle = imbalance ? imbalanceColor : style.textColor
              ctx.fillText(text, cellX + columnWidth / 2, top + height / 2)
            }
          }
        })
      } else if (layout.mode === 'single') {
        const delta = ask - bid
        if (bid + ask > 0) {
          ctx.globalAlpha = maxDelta > 0 ? 0.15 + 0.7 * (Math.abs(delta) / maxDelta) : 0.15
          ctx.fillStyle = delta >= 0 ? style.askColor : style.bidColor
          ctx.fillRect(left, top, Math.max(1, columnWidth - 1), height - inset)
          ctx.globalAlpha = 1
        }
        if (tallEnough) {
          ctx.font = font
          const text = (delta > 0 ? '+' : '') + formatFootprintVolume(delta)
          if (fits(text, columnWidth)) {
            ctx.fillStyle = style.textColor
            ctx.fillText(text, left + columnWidth / 2, top + height / 2)
          }
        }
      } else {
        const total = bid + ask
        if (total > 0 && barMax > 0) {
          const length = Math.max(1, Math.round((areaWidth * total) / barMax))
          const bidLength = Math.round((length * bid) / total)
          ctx.globalAlpha = 0.75
          ctx.fillStyle = style.bidColor
          ctx.fillRect(left, top, bidLength, height - inset)
          ctx.fillStyle = style.askColor
          ctx.fillRect(left + bidLength, top, length - bidLength, height - inset)
          ctx.globalAlpha = 1
        }
        if (tallEnough) {
          ctx.font = font
          const text = formatFootprintVolume(total)
          if (fits(text, areaWidth)) {
            ctx.textAlign = 'left'
            ctx.fillStyle = style.textColor
            ctx.fillText(text, left + 2, top + height / 2)
            ctx.textAlign = 'center'
          }
        }
      }

      if (poc !== null && Math.abs(price - poc) < rowSize / 2 && height >= 3 && areaWidth >= 4) {
        ctx.strokeStyle = style.pocColor
        ctx.lineWidth = 1
        ctx.strokeRect(left + 0.5, top + 0.5, (layout.mode === 'split' ? columnWidth * 2 : areaWidth) - 2, height - 2)
      }
    })
    ctx.restore()
  }

  /**
   * Delta histogram beside a total-volume histogram, both scaled to this bar's
   * largest row, with the POC as a solid bar and the value area as dashed lines
   * that run on into the next bar. Never shows numbers.
   */
  private _drawFootprintHistogram(ctx: CanvasRenderingContext2D, x: number, barSpace: BarSpace, layout: FootprintLayout, data: FootprintBarData, style: CandleFootprintStyle): void {
    const yAxis = this.getWidget().getPane().getAxisComponent()
    const left = x - barSpace.halfGapBar + layout.bodyWidth + layout.gap
    const areaWidth = Math.max(2, barSpace.gapBar - layout.bodyWidth - layout.gap)
    const innerGap = areaWidth >= 20 ? 3 : 1
    const deltaWidth = Math.max(1, Math.floor((areaWidth - innerGap) * 0.45))
    const volumeLeft = left + deltaWidth + innerGap
    const volumeWidth = Math.max(1, areaWidth - deltaWidth - innerGap)
    const { rowSize, rows, poc } = data
    let barMaxDelta = 0
    let barMaxVolume = 0
    rows.forEach(([, bid, ask]) => {
      barMaxDelta = Math.max(barMaxDelta, Math.abs(ask - bid))
      barMaxVolume = Math.max(barMaxVolume, bid + ask)
    })

    ctx.save()
    ctx.setLineDash([])
    rows.forEach(([price, bid, ask]) => {
      const top = Math.round(yAxis.convertToPixel(price + rowSize))
      const bottom = Math.round(yAxis.convertToPixel(price))
      const height = Math.max(1, bottom - top - (bottom - top > 2 ? 1 : 0))
      const delta = ask - bid
      if (delta !== 0 && barMaxDelta > 0) {
        ctx.globalAlpha = 0.85
        ctx.fillStyle = delta > 0 ? style.askColor : style.bidColor
        ctx.fillRect(left, top, Math.max(1, Math.round((deltaWidth * Math.abs(delta)) / barMaxDelta)), height)
      }
      const total = bid + ask
      if (total > 0 && barMaxVolume > 0) {
        const isPoc = poc !== null && Math.abs(price - poc) < rowSize / 2
        ctx.globalAlpha = isPoc ? 1 : 0.8
        ctx.fillStyle = isPoc ? style.valueAreaColor : style.volumeColor
        ctx.fillRect(volumeLeft, top, Math.max(1, Math.round((volumeWidth * total) / barMaxVolume)), height)
      }
    })
    ctx.globalAlpha = 1

    const valueArea = footprintValueArea(rows, rowSize, poc)
    if (valueArea !== null) {
      ctx.strokeStyle = style.valueAreaColor
      ctx.lineWidth = 1
      ctx.setLineDash([3, 2])
      const right = x + barSpace.halfGapBar + barSpace.bar
      for (const price of [valueArea.low, valueArea.high]) {
        const y = Math.round(yAxis.convertToPixel(price)) + 0.5
        ctx.beginPath()
        ctx.moveTo(left, y)
        ctx.lineTo(right, y)
        ctx.stroke()
      }
    }
    ctx.restore()
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
