/**
 * Rotated Text Figure
 *
 * Draws text rotated by a given angle (radians). Used by timeAlertLine
 * to render -90° text between two vertical line segments.
 */

import type Coordinate from '../../common/Coordinate'
import type { TextStyle } from '../../common/Styles'
import { createFont, calcTextWidth } from '../../common/utils/canvas'
import type { FigureTemplate } from '../../component/Figure'

export interface RotatedTextAttrs {
  x: number
  y: number
  text: string
  /** Rotation angle in radians (default: 0). Use -Math.PI/2 for vertical. */
  angle?: number
  align?: CanvasTextAlign
  baseline?: CanvasTextBaseline
}

function checkCoordinateOnRotatedText (coordinate: Coordinate, attrs: RotatedTextAttrs | RotatedTextAttrs[], styles: Partial<TextStyle>): boolean {
  let items: RotatedTextAttrs[] = []
  items = items.concat(attrs)
  const { size = 12, paddingLeft = 0, paddingTop = 0, paddingRight = 0, paddingBottom = 0, weight = 'normal', family } = styles
  for (const item of items) {
    const textW = paddingLeft + calcTextWidth(item.text, size, weight, family) + paddingRight
    const textH = paddingTop + size + paddingBottom
    // Approximate hit-test with axis-aligned bounding box of rotated rect
    const halfW = Math.max(textW, textH) / 2
    const halfH = halfW
    if (
      coordinate.x >= item.x - halfW &&
      coordinate.x <= item.x + halfW &&
      coordinate.y >= item.y - halfH &&
      coordinate.y <= item.y + halfH
    ) {
      return true
    }
  }
  return false
}

function drawRotatedText (ctx: CanvasRenderingContext2D, attrs: RotatedTextAttrs | RotatedTextAttrs[], styles: Partial<TextStyle>): void {
  let items: RotatedTextAttrs[] = []
  items = items.concat(attrs)
  const {
    color = 'currentColor',
    size = 12,
    family,
    weight
  } = styles

  ctx.font = createFont(size, weight, family)
  ctx.fillStyle = color

  for (const item of items) {
    const angle = item.angle ?? 0
    ctx.save()
    ctx.translate(item.x, item.y)
    ctx.rotate(angle)
    ctx.textAlign = item.align ?? 'center'
    ctx.textBaseline = item.baseline ?? 'middle'
    ctx.fillText(item.text, 0, 0)
    ctx.restore()
  }
}

const rotatedText: FigureTemplate<RotatedTextAttrs | RotatedTextAttrs[], Partial<TextStyle>> = {
  name: 'rotatedText',
  checkEventOn: checkCoordinateOnRotatedText,
  draw: (ctx: CanvasRenderingContext2D, attrs: RotatedTextAttrs | RotatedTextAttrs[], styles: Partial<TextStyle>) => {
    drawRotatedText(ctx, attrs, styles)
  }
}

export default rotatedText
