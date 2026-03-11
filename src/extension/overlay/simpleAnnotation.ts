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

import type { OverlayTemplate } from '../../component/Overlay'
import { isFunction, isValid } from '../../common/utils/typeChecks'

interface SimpleAnnotationData {
  text?: string
  direction?: 'up' | 'down'
  color?: string
  textColor?: string
}

function parseExtendData (extendData: unknown, overlay: Parameters<NonNullable<OverlayTemplate['createPointFigures']>>[0]['overlay']): SimpleAnnotationData {
  if (!isValid(extendData)) {
    return { text: '', direction: 'up' }
  }
  if (isFunction(extendData)) {
    return { text: (extendData(overlay)) as string, direction: 'up' }
  }
  if (typeof extendData === 'object' && extendData !== null) {
    const data = extendData as SimpleAnnotationData
    return {
      text: data.text ?? '',
      direction: data.direction ?? 'up',
      color: data.color,
      textColor: data.textColor
    }
  }
  return { text: (extendData ?? '') as string, direction: 'up' }
}

const simpleAnnotation: OverlayTemplate = {
  name: 'simpleAnnotation',
  totalStep: 2,
  styles: {
    line: { style: 'dashed' }
  },
  createPointFigures: ({ overlay, coordinates }) => {
    const { text = '', direction = 'up', color, textColor } = parseExtendData(overlay.extendData, overlay)

    const startX = coordinates[0].x
    const figures: Array<{ type: string; attrs: unknown; styles?: unknown; ignoreEvent?: boolean }> = []

    if (direction === 'down') {
      const startY = coordinates[0].y + 6
      const lineEndY = startY + 50
      const arrowEndY = lineEndY + 5

      figures.push({
        type: 'line',
        attrs: { coordinates: [{ x: startX, y: startY }, { x: startX, y: lineEndY }] },
        styles: isValid(color) ? { style: 'dashed', color } : undefined,
        ignoreEvent: true
      })
      figures.push({
        type: 'polygon',
        attrs: { coordinates: [{ x: startX, y: lineEndY }, { x: startX - 4, y: arrowEndY }, { x: startX + 4, y: arrowEndY }] },
        styles: isValid(color) ? { style: 'fill', color, borderColor: color } : undefined,
        ignoreEvent: true
      })
      if (text.length > 0) {
        figures.push({
          type: 'editableText',
          attrs: { x: startX, y: arrowEndY, text, align: 'center', baseline: 'top' },
          styles: isValid(textColor) ? { color: textColor } : undefined
        })
      }
    } else {
      const startY = coordinates[0].y - 6
      const lineEndY = startY - 50
      const arrowEndY = lineEndY - 5

      figures.push({
        type: 'line',
        attrs: { coordinates: [{ x: startX, y: startY }, { x: startX, y: lineEndY }] },
        styles: isValid(color) ? { style: 'dashed', color } : undefined,
        ignoreEvent: true
      })
      figures.push({
        type: 'polygon',
        attrs: { coordinates: [{ x: startX, y: lineEndY }, { x: startX - 4, y: arrowEndY }, { x: startX + 4, y: arrowEndY }] },
        styles: isValid(color) ? { style: 'fill', color, borderColor: color } : undefined,
        ignoreEvent: true
      })
      if (text.length > 0) {
        figures.push({
          type: 'editableText',
          attrs: { x: startX, y: arrowEndY, text, align: 'center', baseline: 'bottom' },
          styles: isValid(textColor) ? { color: textColor } : undefined
        })
      }
    }

    return figures
  }
}

export default simpleAnnotation
