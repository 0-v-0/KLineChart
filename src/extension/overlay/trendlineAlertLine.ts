/**
 * Trendline Alert Line Overlay
 *
 * A two-point segment line with text label rotated to match the line's angle.
 * The text sits at the midpoint of the line.
 */

import type DeepPartial from '../../common/DeepPartial'
import { merge, clone } from '../../common/utils/typeChecks'

import type { ProOverlayTemplate } from './types'

// ---------------------------------------------------------------------------
// Properties
// ---------------------------------------------------------------------------

export interface TrendlineAlertLineProperties {
  lineColor?: string
  lineWidth?: number
  lineStyle?: 'solid' | 'dashed'
  lineDashedValue?: number[]

  text?: string
  textColor?: string
  textFontSize?: number
  textFont?: string
  /** Pixel gap between the line and the text (perpendicular offset) */
  textOffset?: number
}

const defaults: Required<TrendlineAlertLineProperties> = {
  lineColor: '#3ea6ff',
  lineWidth: 1,
  lineStyle: 'solid',
  lineDashedValue: [4, 4],

  text: '',
  textColor: '#3ea6ff',
  textFontSize: 12,
  textFont: 'Helvetica Neue',
  textOffset: 12
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

const trendlineAlertLine = (): ProOverlayTemplate => {
  let properties: DeepPartial<TrendlineAlertLineProperties> = {}

  const _extRef: { data: DeepPartial<TrendlineAlertLineProperties> | null } = { data: null }

  const prop = <K extends keyof TrendlineAlertLineProperties>(key: K): TrendlineAlertLineProperties[K] => {
    const ext = _extRef.data as Record<string, unknown> | null
    const props = properties as Record<string, unknown>
    const defs = defaults as Record<string, unknown>
    return (ext?.[key] ?? props[key] ?? defs[key]) as TrendlineAlertLineProperties[K]
  }

  return {
    name: 'trendlineAlertLine',
    totalStep: 3,
    needDefaultPointFigure: true,
    needDefaultXAxisFigure: false,
    needDefaultYAxisFigure: false,

    createPointFigures: ({ coordinates, overlay }) => {
      if (coordinates.length < 2) return []

      _extRef.data = (overlay.extendData != null && typeof overlay.extendData === 'object')
        ? overlay.extendData as DeepPartial<TrendlineAlertLineProperties>
        : null

      const text = prop('text') ?? ''
      const textColor = prop('textColor') ?? defaults.textColor
      const textFontSize = prop('textFontSize') ?? defaults.textFontSize
      const textFont = prop('textFont') ?? defaults.textFont
      const textOffset = prop('textOffset') ?? defaults.textOffset

      const lineStyles = {
        style: prop('lineStyle'),
        color: prop('lineColor'),
        size: prop('lineWidth'),
        dashedValue: prop('lineDashedValue')
      }

      const x1 = coordinates[0].x
      const y1 = coordinates[0].y
      const x2 = coordinates[1].x
      const y2 = coordinates[1].y

      const figures: Array<{
        type: string
        key?: string
        attrs: Record<string, unknown>
        styles?: Record<string, unknown>
        ignoreEvent?: boolean
      }> = []

      // Segment line
      figures.push({
        type: 'line',
        key: 'segment',
        attrs: { coordinates: [{ x: x1, y: y1 }, { x: x2, y: y2 }] },
        styles: lineStyles
      })

      // Rotated text at midpoint, matching the line angle
      if (text.length > 0) {
        const midX = (x1 + x2) / 2
        const midY = (y1 + y2) / 2
        const angle = Math.atan2(y2 - y1, x2 - x1)

        // Offset text perpendicular to the line (above it)
        const perpX = -Math.sin(angle) * textOffset
        const perpY = Math.cos(angle) * textOffset

        figures.push({
          type: 'rotatedText',
          key: 'label',
          attrs: {
            x: midX + perpX,
            y: midY + perpY,
            text,
            angle,
            align: 'center',
            baseline: 'middle'
          },
          styles: {
            color: textColor,
            size: textFontSize,
            family: textFont
          }
        })
      }

      return figures
    },

    onRightClick: (event) => {
      ;(event as unknown as { preventDefault?: () => void }).preventDefault?.()
      return false
    },

    setProperties: (_properties: DeepPartial<TrendlineAlertLineProperties>, _id: string) => {
      const newProps = clone(properties) as Record<string, unknown>
      merge(newProps, _properties)
      properties = newProps as DeepPartial<TrendlineAlertLineProperties>
    },

    getProperties: (_id: string): DeepPartial<TrendlineAlertLineProperties> => properties
  }
}

export default trendlineAlertLine
