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

import type Coordinate from '../common/Coordinate'
import type Nullable from '../common/Nullable'
import { SymbolDefaultPrecisionConstants } from '../common/SymbolInfo'
import { formatPrecision } from '../common/utils/format'
import { isNumber, isValid } from '../common/utils/typeChecks'

import type { Axis } from '../component/Axis'
import type OverlayImp from '../component/Overlay'
import type { Overlay, OverlayFigure } from '../component/Overlay'
import type YAxisImp from '../component/YAxis'
import type { YAxis } from '../component/YAxis'
import OverlayView from './OverlayView'

export interface TagBox {
  key: string
  /** Centre of the tag as drawn. */
  y: number
  height: number
  fixed: boolean
  /** The price it labels. Orders the stack: a tag 1 unit above the last price
   *  can land on the same pixel, and then only the price says which is higher. */
  value?: number
}

const TAG_GAP = 1
const TAG_EDGE_TOP = '__top__'
const TAG_EDGE_BOTTOM = '__bottom__'

function edgeRank(key: string): number {
  if (key === TAG_EDGE_TOP) {
    return -1
  }
  return key === TAG_EDGE_BOTTOM ? 1 : 0
}

/**
 * Pushes overlapping tags apart, keeping their price order.
 *
 * The order is taken once, by the price a tag labels where it has one (higher
 * first, or lower on a reversed scale) and by where it is drawn otherwise, so
 * re-sorting as tags move cannot let one jump past its neighbour. A fixed tag
 * (the last price, a pane edge) does not move; what overlaps it does.
 *
 * With `bounds`, the pane's edges join as two fixed, zero-height tags that sort
 * first and last, so a stack that would run off the pane moves back inside as a
 * block instead of being cut off. A tag whose own price is off the pane is left
 * out of the stack rather than dragged in to the edge.
 */
export function stackTags(input: readonly TagBox[], reversed = false, bounds?: { top: number; bottom: number }): Map<string, number> {
  const shifts = new Map<string, number>()
  const edges: TagBox[] =
    bounds === undefined
      ? []
      : [
          { key: TAG_EDGE_TOP, y: bounds.top, height: 0, fixed: true },
          { key: TAG_EDGE_BOTTOM, y: bounds.bottom, height: 0, fixed: true }
        ]
  const inside = bounds === undefined ? input : input.filter((box) => box.y >= bounds.top && box.y <= bounds.bottom)
  if (!inside.some((box) => !box.fixed)) {
    return shifts
  }
  const boxes = [...edges, ...inside]
    .map((box, index) => ({ ...box, index }))
    .sort((a, b) => {
      if (edgeRank(a.key) !== edgeRank(b.key)) {
        return edgeRank(a.key) - edgeRank(b.key)
      }
      const { value: av } = a
      const { value: bv } = b
      if (isNumber(av) && isNumber(bv) && av !== bv) {
        return reversed ? av - bv : bv - av
      }
      if (a.y !== b.y) {
        return a.y - b.y
      }
      return a.index - b.index
    })
  const originals = boxes.map((box) => box.y)
  for (let iteration = 0; iteration < 50; iteration++) {
    let moved = false
    for (let i = 1; i < boxes.length; i++) {
      const a = boxes[i - 1]
      const b = boxes[i]
      const deficit = (a.height + b.height) / 2 + TAG_GAP - (b.y - a.y)
      if (deficit <= 0.01) {
        continue
      }
      moved = true
      if (a.fixed && b.fixed) {
        continue
      }
      if (a.fixed) {
        b.y += deficit
      } else if (b.fixed) {
        a.y -= deficit
      } else {
        a.y -= deficit / 2
        b.y += deficit / 2
      }
    }
    if (!moved) {
      break
    }
  }
  boxes.forEach((box, index) => {
    if (box.fixed) {
      return
    }
    const dy = box.y - originals[index]
    if (Math.abs(dy) > 0.01) {
      shifts.set(box.key, dy)
    }
  })
  return shifts
}

export default class OverlayYAxisView<C extends Axis = YAxis> extends OverlayView<C> {
  /** Vertical shift per `overlayId:figureIndex:attrIndex`, from the last layout. */
  private _tagShifts = new Map<string, number>()
  private _inDefaultFigures = false

  override drawImp(ctx: CanvasRenderingContext2D): void {
    this._layoutTags()
    super.drawImp(ctx)
  }

  override drawAboveCrosshair(ctx: CanvasRenderingContext2D): void {
    this._layoutTags()
    super.drawAboveCrosshair(ctx)
  }

  /**
   * Whether this axis stacks its tags. Price axes only: the x-axis view
   * extends this one but has no last-price tag or vertical stacking.
   */
  protected stacksTags(): boolean {
    return true
  }

  /**
   * Collision avoidance for the price tags: collects every overlay `text` tag
   * plus the candle's last-price tag (which never moves) and hands them to
   * `stackTags`, which pushes overlapping tags apart by at least a label
   * height without letting them change price order.
   */
  private _layoutTags(): void {
    const shifts = new Map<string, number>()
    this._tagShifts = shifts
    if (!this.stacksTags()) {
      return
    }
    const widget = this.getWidget()
    const pane = widget.getPane()
    const chart = pane.getChart()
    const chartStore = chart.getChartStore()
    const boxes: TagBox[] = []
    const defaultTextStyles = chart.getStyles().overlay.text as unknown as Record<string, unknown>

    const lastPrice = this._lastPriceBox()
    if (lastPrice !== null) {
      boxes.push(lastPrice)
    }

    const overlays = [...this.getCompleteOverlays()]
    const progress = this.getProgressOverlay()
    if (isValid(progress)) {
      overlays.push(progress)
    }
    const yAxis = pane.getAxisComponent() as unknown as Nullable<YAxis>
    overlays.forEach((overlay) => {
      if (!chartStore.isOverlayShown(overlay) || overlay.createYAxisFigures == null) {
        return
      }
      const coordinates = overlay.points.map((point) => ({
        x: 0,
        y: isNumber(point.value) ? (yAxis?.convertToPixel(point.value) ?? 0) : 0
      }))
      if (coordinates.length === 0) {
        return
      }
      const figures: OverlayFigure[] = ([] as OverlayFigure[]).concat(this.getFigures(overlay, coordinates) as OverlayFigure[])
      figures.forEach((figure, figureIndex) => {
        if (figure.type !== 'text') {
          return
        }
        const attrsArray: Array<{ y?: number; height?: number; key?: string }> = ([] as Array<{ y?: number; height?: number; key?: string }>).concat(figure.attrs as Array<{ y?: number; height?: number; key?: string }>)
        attrsArray.forEach((attrs, attrIndex) => {
          if (!isNumber(attrs.y)) {
            return
          }
          const key = attrs.key ?? figure.key
          const keyed = key != null && key !== '' ? (overlay.figureStyles[key] as Record<string, unknown> | undefined) : undefined
          const figureStyles = (figure.styles ?? {}) as Record<string, unknown>
          const merged: Record<string, unknown> = { ...defaultTextStyles, ...(overlay.styles?.text as Record<string, unknown> | undefined), ...figureStyles, ...keyed }
          const height = isNumber(attrs.height) ? attrs.height : Number(merged.size ?? 12) + Number(merged.paddingTop ?? 0) + Number(merged.paddingBottom ?? 0)
          // The price it labels: the point it sits on, else what the axis reads there.
          const y = attrs.y
          const at = coordinates.findIndex((coordinate) => Math.abs(coordinate.y - y) < 1)
          const pointValue = at === -1 ? undefined : overlay.points[at]?.value
          const value = isNumber(pointValue) ? pointValue : yAxis?.convertFromPixel(y)
          boxes.push({ key: `${overlay.id}:${figureIndex}:${attrIndex}`, y, height, fixed: false, ...(isNumber(value) ? { value } : {}) })
        })
      })
    })

    const bounding = widget.getBounding()
    stackTags(boxes, (yAxis as Nullable<{ reverse?: boolean }>)?.reverse === true, { top: 0, bottom: bounding.height }).forEach((dy, key) => {
      shifts.set(key, dy)
    })
  }

  private _lastPriceBox(): Nullable<TagBox> {
    const widget = this.getWidget()
    const pane = widget.getPane()
    const yAxis = pane.getAxisComponent() as unknown as YAxisImp
    if (!yAxis.isInCandle()) {
      return null
    }
    const chartStore = pane.getChart().getChartStore()
    const priceMark = chartStore.getStyles().candle.priceMark
    if (!priceMark.show || !priceMark.last.show || !priceMark.last.text.show) {
      return null
    }
    const dataList = chartStore.getDataList(true)
    const data = dataList[dataList.length - 1]
    if (!isValid(data)) {
      return null
    }
    // The whole tag: the price row plus the rows drawn above and below it (the
    // bar countdown), laid out as `CandleLastPriceLabelView` lays them out.
    // Counting the price row alone let a tag pushed below it land under the
    // countdown, which draws on top of it.
    const { size, paddingTop, paddingBottom } = priceMark.last.text
    const priceY = yAxis.convertToNicePixel(data.close)
    let top = priceY - size / 2 - paddingTop
    let bottom = priceY + size / 2 + paddingBottom
    const formatExtendText = chartStore.getInnerFormatter().formatExtendText
    priceMark.last.extendTexts.forEach((item, index) => {
      if (!item.show || formatExtendText({ type: 'last_price', data, index }).length === 0) {
        return
      }
      const rowHeight = item.paddingTop + item.size + item.paddingBottom
      if (item.position === 'above_price') {
        top -= rowHeight
      } else {
        bottom += rowHeight
      }
    })
    return { key: '__last_price__', y: (top + bottom) / 2, height: bottom - top, fixed: true, value: data.close }
  }

  protected override drawFigures(ctx: CanvasRenderingContext2D, overlay: OverlayImp, figures: OverlayFigure[]): void {
    if (this._inDefaultFigures || this._tagShifts.size === 0) {
      super.drawFigures(ctx, overlay, figures)
      return
    }
    const shifted = figures.map((figure, figureIndex) => {
      if (figure.type !== 'text') {
        return figure
      }
      const attrsArray: Array<{ y?: number }> = ([] as Array<{ y?: number }>).concat(figure.attrs as Array<{ y?: number }>)
      let changed = false
      const next = attrsArray.map((attrs, attrIndex) => {
        const dy = this._tagShifts.get(`${overlay.id}:${figureIndex}:${attrIndex}`)
        if (dy === undefined || !isNumber(attrs.y)) {
          return attrs
        }
        changed = true
        return { ...attrs, y: attrs.y + dy }
      })
      if (!changed) {
        return figure
      }
      const result: OverlayFigure = { ...figure, attrs: Array.isArray(figure.attrs) ? next : next[0] }
      return result
    })
    super.drawFigures(ctx, overlay, shifted)
  }

  override coordinateToPointTimestampDataIndexFlag(): boolean {
    return false
  }

  /** The host can hide every label the selected drawing puts on an axis. */
  protected showSelectedOverlayLabel(): boolean {
    return this.getWidget().getPane().getChart().getChartStore().getShowSelectedOverlayLabel()
  }

  override drawDefaultFigures(ctx: CanvasRenderingContext2D, overlay: OverlayImp, coordinates: Coordinate[]): void {
    // The default tags are what `_layoutTags` measures, so they are drawn where
    // it found them; only the tags the overlay positions itself are shifted.
    this._inDefaultFigures = true
    try {
      this.drawFigures(ctx, overlay, this.getDefaultFigures(overlay, coordinates))
    } finally {
      this._inDefaultFigures = false
    }
  }

  protected getDefaultFigures(overlay: Overlay, coordinates: Coordinate[]): OverlayFigure[] {
    if (!this.showSelectedOverlayLabel()) {
      return []
    }
    const widget = this.getWidget()
    const pane = widget.getPane()
    const chartStore = pane.getChart().getChartStore()
    const clickOverlayInfo = chartStore.getClickOverlayInfo()
    const figures: OverlayFigure[] = []
    if (overlay.needDefaultYAxisFigure && overlay.id === clickOverlayInfo.overlay?.id && clickOverlayInfo.paneId === pane.getId()) {
      const yAxis = pane.getYAxisComponentById() as unknown as YAxisImp
      const bounding = widget.getBounding()
      let topY = Number.MAX_SAFE_INTEGER
      let bottomY = Number.MIN_SAFE_INTEGER
      const isFromZero = yAxis.isFromZero()
      let textAlign: CanvasTextAlign = 'left'
      let x = 0
      if (isFromZero) {
        textAlign = 'left'
        x = 0
      } else {
        textAlign = 'right'
        x = bounding.width
      }
      const decimalFold = chartStore.getDecimalFold()
      const thousandsSeparator = chartStore.getThousandsSeparator()
      // A tag beside the candle pane's price scale folds to the scale's own
      // zero count; a tag on an indicator pane has no such count to share.
      const foldPrice = (value: string): string => (yAxis.isInCandle() ? decimalFold.formatPrice(value) : decimalFold.format(value))
      coordinates.forEach((coordinate, index) => {
        const point = overlay.points[index]
        if (isNumber(point.value)) {
          topY = Math.min(topY, coordinate.y)
          bottomY = Math.max(bottomY, coordinate.y)
          const text = foldPrice(thousandsSeparator.format(formatPrecision(point.value, chartStore.getSymbol()?.pricePrecision ?? SymbolDefaultPrecisionConstants.PRICE)))
          figures.push({ type: 'text', attrs: { x, y: coordinate.y, text, align: textAlign, baseline: 'middle' }, ignoreEvent: true })
        }
      })
      if (coordinates.length > 1 && topY <= bottomY) {
        figures.unshift({ type: 'rect', attrs: { x: 0, y: topY, width: bounding.width, height: bottomY - topY }, ignoreEvent: true })
      }
    }
    return figures
  }

  override getFigures(overlay: Overlay, coordinates: Coordinate[]): OverlayFigure | OverlayFigure[] {
    if (!this.showSelectedOverlayLabel()) {
      return []
    }
    const widget = this.getWidget()
    const pane = widget.getPane()
    const chart = pane.getChart()
    const yAxis = pane.getYAxisComponentById() as unknown as Nullable<YAxis>
    const xAxis = chart.getXAxisPane().getXAxisComponent()
    const bounding = widget.getBounding()
    return overlay.createYAxisFigures?.({ chart, overlay, coordinates, bounding, xAxis, yAxis }) ?? []
  }
}
