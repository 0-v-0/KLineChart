/**
 *       ___           ___                   ___           ___           ___           ___           ___           ___           ___
 *      /\__\         /\__\      ___        /\__\         /\  \         /\  \         /\__\         /\  \         /\  \         /\  \
 *     /:/  /        /:/  /     /\  \      /::|  |       /::\  \       /::\  \       /:/  /        /::\  \       /::\  \        \:\  \
 *    /:/__/        /:/  /      \:\  \    /:|:|  |      /:/\:\  \     /:/\:\  \     /:/__/        /:/\:\  \     /:/\:\  \        \:\  \
 *   /::\__\____   /:/  /       /::\__\  /:/|:|  |__   /::\~\:\  \   /:/  \:\  \   /::\  \ ___   /::\~\:\  \   /::\~\:\  \       /::\  \
 *  /:/\:::::\__\ /:/__/     __/:/\/__/ /:/ |:| /\__\ /:/\:\ \:\__\ /:/__/ \:\__\ /:/\:\  /\__\ /:/\:\ \:\__\ /:/\:\ \:\__\     /:/\:\__\
 *  \/_|:|~~|~    \:\  \    /\/:/  /    \/__|:|/:/  / \:\~\:\ \/__/ \:\  \  \/__/ \/__\:\/:/  / \/__\:\/:/  / \/_|::\/:/  /    /:/  \/__/
 *     |:|  |      \:\  \   \::/__/         |:/:/  /   \:\ \:\__\    \:\  \            \::/  /       \::/  /     |:|::/  /    /:/  /
 *     |:|  |       \:\  \   \:\__\         |::/  /     \:\ \/__/     \:\  \           /:/  /        /:/  /      |:|\/__/     \/__/
 *     |:|  |        \:\__\   \/__/         /:/  /       \:\__\        \:\__\         /:/  /        /:/  /       |:|  |
 *      \|__|         \/__/                 \/__/         \/__/         \/__/         \/__/         \/__/         \|__|
 *
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

import { getHotkey, getSupportedHotkeys, registerHotkey } from './extension/hotkey/index'
import type { Styles, LineType, PolygonType, TooltipShowRule, TooltipShowType, FeatureType, TooltipFeaturePosition, CandleType, CandleTooltipRectPosition } from './common/Styles'
import type Nullable from './common/Nullable'
import type DeepPartial from './common/DeepPartial'
import type { KLineData } from './common/Data'
import type Point from './common/Point'

import { logError, logTag, logWarn } from './common/utils/logger'

import { clone, merge, isString, isNumber, isValid, isObject, isArray, isFunction, isBoolean } from './common/utils/typeChecks'
import { formatValue, formatPrecision, formatBigNumber, formatThousands, formatFoldDecimal, formatFoldDecimals, formatTimestampByTemplate } from './common/utils/format'
import { calcTextWidth } from './common/utils/canvas'
import type { ActionType } from './common/Action'
import type { Indicator, IndicatorCreate, IndicatorSeries, IndicatorTemplate } from './component/Indicator'
import type { Overlay, OverlayCreate, OverlayEvent, OverlayTemplate, OverlayMode, OverlayDrawingMode, OverlayTextChangeEvent, OverlayTextChangeCallback } from './component/Overlay'
import type { FigureTemplate } from './component/Figure'
import { setHitAreaDebug } from './component/Figure'
import type { YAxisOverride } from './component/YAxis'

import type { OverlayNudgeDirection } from './Store'
import type { FormatDateType, Layout, Options, ZoomAnchor } from './Options'
import type { BarSpaceLimit } from './common/BarSpace'
import ChartImp, { type Chart, type DomPosition, type YAxisFilter } from './Chart'
import { OVERLAY_Z_LEVEL_ABOVE_CROSSHAIR } from './view/OverlayView'
import { isSetVisibleRangeError, type SetVisibleRangeError, type SetVisibleRangeErrorCode } from './common/Errors'
import type { ReplayStatus, ReplayEngine } from './replay/types'

import { checkCoordinateOnArc } from './extension/figure/arc'
import { checkCoordinateOnCircle } from './extension/figure/circle'
import { getFigureClass, getSupportedFigures, registerFigure } from './extension/figure/index'
import { checkCoordinateOnLine, getLinearSlopeIntercept, getLinearYFromCoordinates, getLinearYFromSlopeIntercept } from './extension/figure/line'
import { checkCoordinateOnPolygon } from './extension/figure/polygon'
import { checkCoordinateOnRect } from './extension/figure/rect'
import { checkCoordinateOnText } from './extension/figure/text'

import { registerIndicator, getSupportedIndicators } from './extension/indicator/index'
import { registerLocale, getSupportedLocales } from './extension/i18n/index'
import {
  registerOverlay,
  getOverlayClass,
  getSupportedOverlays,
  createPriceLine,
  createTradeLine,
  isProOverlayTemplate,
  createPropertiesStore,
  DEFAULT_OVERLAY_PROPERTIES,
  FIBONACCI_RETRACEMENT_LEVELS,
  FIBONACCI_CHANNEL_LEVELS,
  FIBONACCI_EXTENSION_LEVELS,
  FIBONACCI_CIRCLE_LEVELS,
  FIBONACCI_FAN_LEVELS
} from './extension/overlay/index'
import type { OverlayProperties, ProOverlayTemplate, OverlayPropertiesStore, FigureLevel, PriceLineProperties, PriceLine, PriceLineEventListener, TradeLineProperties, TradeLine, TradeLineOptions } from './extension/overlay/index'
import { registerStyles } from './extension/styles/index'
import { registerXAxis } from './extension/x-axis'
import { registerYAxis } from './extension/y-axis'

const charts = new Map<string, ChartImp>()
let chartBaseId = 1

/**
 * Chart version
 * @return {string}
 */
function version(): string {
  return '__VERSION__'
}

/**
 * Init chart instance
 * @param ds
 * @param options
 * @returns {Chart}
 */
function init(ds: HTMLElement | string, options?: Options): Nullable<Chart> {
  if (options?.debug !== false) {
    logTag()
  }
  let dom: Nullable<HTMLElement> = null
  if (isString(ds)) {
    dom = document.getElementById(ds)
  } else {
    dom = ds
  }
  if (dom === null) {
    logError('', '', 'The chart cannot be initialized correctly. Please check the parameters. The chart container cannot be null and child elements need to be added!!!')
    return null
  }
  let chart = charts.get(dom.getAttribute('k-line-chart-id') ?? '')
  if (isValid(chart)) {
    logWarn('', '', 'The chart has been initialized on the dom！！！')
    return chart
  }
  const id = `k_line_chart_${chartBaseId++}`
  chart = new ChartImp(dom, options)
  chart.id = id
  dom.setAttribute('k-line-chart-id', id)
  charts.set(id, chart)
  return chart
}

/**
 * Destroy chart instance
 * @param dcs
 */
function dispose(dcs: HTMLElement | Chart | string): void {
  let id: Nullable<string> = null
  if (dcs instanceof ChartImp) {
    id = dcs.id
  } else {
    let dom: Nullable<HTMLElement> = null
    if (isString(dcs)) {
      dom = document.getElementById(dcs)
    } else {
      dom = dcs as HTMLElement
    }
    id = dom?.getAttribute('k-line-chart-id') ?? null
  }
  if (id !== null) {
    charts.get(id)?.destroy()
    charts.delete(id)
  }
}

const utils = {
  clone,
  merge,
  isString,
  isNumber,
  isValid,
  isObject,
  isArray,
  isFunction,
  isBoolean,
  formatValue,
  formatPrecision,
  formatBigNumber,
  formatDate: formatTimestampByTemplate,
  formatThousands,
  formatFoldDecimal,
  formatFoldDecimals,
  calcTextWidth,
  getLinearSlopeIntercept,
  getLinearYFromSlopeIntercept,
  getLinearYFromCoordinates,
  checkCoordinateOnArc,
  checkCoordinateOnCircle,
  checkCoordinateOnLine,
  checkCoordinateOnPolygon,
  checkCoordinateOnRect,
  checkCoordinateOnText
}

export {
  // types
  type ActionType,
  type BarSpaceLimit,
  type CandleTooltipRectPosition,
  type CandleType,
  type Chart,
  type DeepPartial,
  type DomPosition,
  type FeatureType,
  type FigureLevel,
  type FigureTemplate,
  type FormatDateType,
  type Indicator,
  type IndicatorCreate,
  type IndicatorSeries,
  type IndicatorTemplate,
  type KLineData,
  type Layout,
  type LineType,
  type Nullable,
  type Options,
  type Overlay,
  type OverlayCreate,
  type OverlayDrawingMode,
  type OverlayEvent,
  type OverlayMode,
  type OverlayNudgeDirection,
  type OverlayProperties,
  type OverlayPropertiesStore,
  type OverlayTemplate,
  type OverlayTextChangeCallback,
  type OverlayTextChangeEvent,
  type Point,
  type PolygonType,
  type PriceLine,
  type PriceLineEventListener,
  type PriceLineProperties,
  type ProOverlayTemplate,
  type ReplayEngine,
  type ReplayStatus,
  type SetVisibleRangeError,
  type SetVisibleRangeErrorCode,
  type Styles,
  type TooltipFeaturePosition,
  type TooltipShowRule,
  type TooltipShowType,
  type TradeLine,
  type TradeLineOptions,
  type TradeLineProperties,
  type YAxisFilter,
  type YAxisOverride,
  type ZoomAnchor,
  // values
  createPriceLine,
  createPropertiesStore,
  createTradeLine,
  DEFAULT_OVERLAY_PROPERTIES,
  dispose,
  FIBONACCI_CHANNEL_LEVELS,
  FIBONACCI_CIRCLE_LEVELS,
  FIBONACCI_EXTENSION_LEVELS,
  FIBONACCI_FAN_LEVELS,
  FIBONACCI_RETRACEMENT_LEVELS,
  getFigureClass,
  getHotkey,
  getOverlayClass,
  getSupportedFigures,
  getSupportedHotkeys,
  getSupportedIndicators,
  getSupportedLocales,
  getSupportedOverlays,
  init,
  isProOverlayTemplate,
  isSetVisibleRangeError,
  registerFigure,
  registerHotkey,
  registerIndicator,
  registerLocale,
  registerOverlay,
  registerStyles,
  registerXAxis,
  registerYAxis,
  // Drawings at this `zLevel` or above are painted after the crosshair.
  OVERLAY_Z_LEVEL_ABOVE_CROSSHAIR,
  // Development aid: paint every figure's click tolerance.
  setHitAreaDebug,
  utils,
  version
}
