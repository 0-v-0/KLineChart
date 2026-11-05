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

import type Nullable from '../../common/Nullable'

import OverlayImp, { type OverlayConstructor, type OverlayInnerConstructor, type OverlayTemplate } from '../../component/Overlay'
// Harmonic pattern overlays (Pro overlays with factory pattern)
import abcd from './abcd'
import anyWaves from './anyWaves'
// Basic shape overlays (Pro overlays with factory pattern)
import arrow from './arrow'
import { arrowMark } from './arrowMark'
import arrowMarker from './arrowMarker'
import box from './box'
import brush from './brush'
import callout from './callout'
import circle from './circle'
import crossLine from './crossLine'
import curve from './curve'
import comment from './comment'
import eightWaves from './eightWaves'
import emojiMarker from './emojiMarker'
import fibonacciCircle from './fibonacciCircle'
import fibonacciExtension from './fibonacciExtension'
// Fibonacci overlays (Pro overlays with factory pattern)
import fibonacciLine from './fibonacciLine'
import fibonacciSegment from './fibonacciSegment'
import fibonacciSpeedResistanceFan from './fibonacciSpeedResistanceFan'
import fibonacciSpiral from './fibonacciSpiral'
import fiveWaves from './fiveWaves'
import flagMark from './flagMark'
import freePath from './freePath'
// Gann overlays (Pro overlays with factory pattern)
import gannBox from './gannBox'
// Basic line overlays
import horizontalRayLine from './horizontalRayLine'
import horizontalSegment from './horizontalSegment'
import horizontalStraightLine from './horizontalStraightLine'
import image from './image'
import measure from './measure'
import note from './note'
import parallelogram from './parallelogram'
import parallelChannel from './parallelChannel'
import parallelStraightLine from './parallelStraightLine'
import pin from './pin'
import priceChannelLine from './priceChannelLine'
import priceLabel from './priceLabel'
import priceLevelLine from './priceLevelLine'
import priceLine from './priceLine'
import { multiPoint } from './polyline'
import priceNote from './priceNote'
import { position } from './position'
import { rangeTool } from './rangeTools'
import rayLine from './rayLine'
import rect from './rect'
import segment from './segment'
import signpost from './signpost'
// Annotation overlays
import simpleAnnotation from './simpleAnnotation'
import simpleTag from './simpleTag'
import straightLine from './straightLine'
import styledSegment from './styledSegment'
import table from './table'
import text from './text'
// Wave pattern overlays (Pro overlays with factory pattern)
import threeWaves from './threeWaves'
// Generic primitive overlays (Pro overlays with factory pattern)
import timeLine from './timeLine'
// Trade line overlay (Pro overlay with factory pattern)
import tradeLine from './tradeLine'
import triangle from './triangle'
// TradingView-parity tools, grouped by family; each group owns its own folder.
import { factories as tvAnnotationFactories } from './tv/annotations'
import { factories as tvFibCycleFactories } from './tv/fibCycles'
import { factories as tvForecastDataFactories } from './tv/forecastData'
import { factories as tvLineShapeFactories } from './tv/linesShapes'
import { factories as tvPatternFactories } from './tv/patterns'
import { factories as tvPitchforkGannFactories } from './tv/pitchforkGann'
import { isProOverlayTemplate } from './types'
import verticalRayLine from './verticalRayLine'
import verticalSegment from './verticalSegment'
import verticalStraightLine from './verticalStraightLine'
import xabcd from './xabcd'

const overlays: Record<string, OverlayInnerConstructor> = {}

// Standard overlays (direct templates)
const standardExtensions = [simpleAnnotation, simpleTag, freePath, text, note, callout, comment, priceLabel, priceNote, signpost, flagMark, pin, table, image, measure]

// Pro overlays (factory functions that return templates)
const proExtensions = [
  horizontalRayLine,
  horizontalSegment,
  horizontalStraightLine,
  rayLine,
  segment,
  straightLine,
  priceLine,
  arrow,
  circle,
  rect,
  triangle,
  parallelogram,
  brush,
  parallelStraightLine,
  parallelChannel,
  priceChannelLine,
  verticalRayLine,
  verticalSegment,
  verticalStraightLine,
  fibonacciLine,
  fibonacciCircle,
  fibonacciSegment,
  fibonacciSpiral,
  fibonacciSpeedResistanceFan,
  fibonacciExtension,
  threeWaves,
  fiveWaves,
  eightWaves,
  anyWaves,
  abcd,
  xabcd,
  gannBox,
  tradeLine,
  timeLine,
  priceLevelLine,
  crossLine,
  arrowMark('up'),
  arrowMark('down'),
  arrowMark('left'),
  arrowMark('right'),
  arrowMarker,
  multiPoint('polyline'),
  multiPoint('path'),
  curve,
  rangeTool('price'),
  rangeTool('date'),
  rangeTool('dateAndPrice'),
  position('long'),
  position('short'),
  styledSegment,
  box,
  emojiMarker,
  // TradingView-parity drawing tools.
  ...tvAnnotationFactories,
  ...tvFibCycleFactories,
  ...tvForecastDataFactories,
  ...tvLineShapeFactories,
  ...tvPatternFactories,
  ...tvPitchforkGannFactories
]

// Register standard overlays (direct templates)
standardExtensions.forEach((template: OverlayTemplate) => {
  overlays[template.name] = OverlayImp.extend(template)
})

// Register pro overlays (call factory functions to get templates)
// Auto-wire onTextChange for Pro overlays to update their properties store
proExtensions.forEach((factory) => {
  const template = factory()
  if (isProOverlayTemplate(template) && template.onTextChange == null) {
    template.onTextChange = ({ overlay, text }) => {
      template.setProperties?.({ text }, overlay.id)
    }
  }
  overlays[template.name] = OverlayImp.extend(template)
})

function registerOverlay<E = unknown>(template: OverlayTemplate<E>): void {
  // @ts-ignore
  overlays[template.name] = OverlayImp.extend(template)
}

function getOverlayInnerClass(name: string): Nullable<OverlayInnerConstructor> {
  return overlays[name] ?? null
}

function getOverlayClass(name: string): Nullable<OverlayConstructor> {
  return overlays[name] ?? null
}

function getSupportedOverlays(): string[] {
  return Object.keys(overlays)
}

export { FIBONACCI_CIRCLE_LEVELS } from './fibonacciCircle'
export { FIBONACCI_EXTENSION_LEVELS } from './fibonacciExtension'
// Export default levels for fibonacci overlays
export { FIBONACCI_CHANNEL_LEVELS, FIBONACCI_RETRACEMENT_LEVELS } from './fibonacciLine'
export { FIBONACCI_FAN_LEVELS } from './fibonacciSpeedResistanceFan'
// Export price line types and fluent API
export type { PriceLine, PriceLineEventListener, PriceLineProperties } from './priceLineApi'
export { createPriceLine } from './priceLineApi'
// Export trade line types and fluent API
export type { TradeLine, TradeLineOptions, TradeLineProperties } from './tradeLineApi'
export { createTradeLine } from './tradeLineApi'
// Export Pro overlay types and utilities
export type { DeepPartial, FigureLevel, OverlayProperties, OverlayPropertiesStore, ProOverlayTemplate } from './types'
export { createPropertiesStore, DEFAULT_OVERLAY_PROPERTIES, isProOverlayTemplate } from './types'
export { getOverlayClass, getOverlayInnerClass, getSupportedOverlays, registerOverlay }
