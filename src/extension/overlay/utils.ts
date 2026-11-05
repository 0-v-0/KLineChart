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

import type Bounding from '../../common/Bounding'
import type Coordinate from '../../common/Coordinate'
import type Nullable from '../../common/Nullable'
import type { OverlayMode } from '../../component/Overlay'

import { getLinearYFromCoordinates, type LineAttrs } from '../figure/line'

/**
 * Get rotated coordinate around a target point
 */
export function getRotateCoordinate(coordinate: Coordinate, targetCoordinate: Coordinate, angle: number): Coordinate {
  const x = (coordinate.x - targetCoordinate.x) * Math.cos(angle) - (coordinate.y - targetCoordinate.y) * Math.sin(angle) + targetCoordinate.x
  const y = (coordinate.x - targetCoordinate.x) * Math.sin(angle) + (coordinate.y - targetCoordinate.y) * Math.cos(angle) + targetCoordinate.y
  return { x, y }
}

/**
 * Get ray line extending to bounding edge
 */
export function getRayLine(coordinates: Coordinate[], bounding: Bounding): LineAttrs | LineAttrs[] {
  if (coordinates.length > 1) {
    let coordinate = { x: 0, y: 0 }
    if (coordinates[0].x === coordinates[1].x && coordinates[0].y !== coordinates[1].y) {
      if (coordinates[0].y < coordinates[1].y) {
        coordinate = {
          x: coordinates[0].x,
          y: bounding.height
        }
      } else {
        coordinate = {
          x: coordinates[0].x,
          y: 0
        }
      }
    } else if (coordinates[0].x > coordinates[1].x) {
      coordinate = {
        x: 0,
        y: getLinearYFromCoordinates(coordinates[0], coordinates[1], { x: 0, y: coordinates[0].y })
      }
    } else {
      coordinate = {
        x: bounding.width,
        y: getLinearYFromCoordinates(coordinates[0], coordinates[1], { x: bounding.width, y: coordinates[0].y })
      }
    }
    return { coordinates: [coordinates[0], coordinate] }
  }
  return []
}

/**
 * Get distance between two coordinates
 */
export function getDistance(coordinate1: Coordinate, coordinate2: Coordinate): number {
  const xDis = Math.abs(coordinate1.x - coordinate2.x)
  const yDis = Math.abs(coordinate1.y - coordinate2.y)
  return Math.sqrt(xDis * xDis + yDis * yDis)
}

/**
 * Triangle for an arrowhead whose tip is `to`, pointing away from `from`:
 * `length` px deep, `length` px wide. Empty when the two points coincide.
 */
export function arrowHeadCoordinates(from: Coordinate, to: Coordinate, length: number): Coordinate[] {
  const len = Math.hypot(to.x - from.x, to.y - from.y)
  if (len === 0) {
    return []
  }
  const ux = (to.x - from.x) / len
  const uy = (to.y - from.y) / len
  const bx = to.x - ux * length
  const by = to.y - uy * length
  return [to, { x: bx - (uy * length) / 2, y: by + (ux * length) / 2 }, { x: bx + (uy * length) / 2, y: by - (ux * length) / 2 }]
}

/** How far a press must travel before its release places the next drawing point. */
export const DRAG_DRAW_MIN_PX = 4

/** Whether a press at `from` has travelled far enough to count as a drag rather than a click. */
export function isDragBeyond(from: Coordinate, to: Coordinate, minPx = DRAG_DRAW_MIN_PX): boolean {
  return Math.hypot(to.x - from.x, to.y - from.y) >= minPx
}

/**
 * Lock a drag to the axis it has travelled further along, measured from where
 * it was pressed: a horizontal drag keeps the press's y, a vertical one its x.
 */
export function constrainToAxis(from: Coordinate, to: Coordinate): Coordinate {
  return Math.abs(to.x - from.x) >= Math.abs(to.y - from.y) ? { x: to.x, y: from.y } : { x: from.x, y: to.y }
}

/**
 * Snap `coordinate` to the nearest 45° ray from `anchor` — the Shift gesture on
 * a point handle or an in-progress line. The cursor is projected onto the ray
 * rather than kept at its raw distance, so sliding sideways shortens the line
 * instead of swinging its far end out past the pointer.
 */
export function snapToAngles(anchor: Coordinate, coordinate: Coordinate): Coordinate {
  const dx = coordinate.x - anchor.x
  const dy = coordinate.y - anchor.y
  const step = Math.PI / 4
  const angle = Math.round(Math.atan2(dy, dx) / step) * step
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  const reach = dx * cos + dy * sin
  return { x: anchor.x + reach * cos, y: anchor.y + reach * sin }
}

/**
 * Snap a corner to a square: both sides take the longer distance, each on the
 * side the cursor is. This is what keeps a rectangle from becoming a
 * near-square by accident.
 */
export function snapToSquare(anchor: Coordinate, coordinate: Coordinate): Coordinate {
  const dx = coordinate.x - anchor.x
  const dy = coordinate.y - anchor.y
  const side = Math.max(Math.abs(dx), Math.abs(dy))
  return { x: anchor.x + (dx < 0 ? -side : side), y: anchor.y + (dy < 0 ? -side : side) }
}

/**
 * The third point of an ellipse or a rotated rectangle, snapped so the shape
 * keeps the axis it was given: the cursor keeps its position along the axis and
 * its side of it, and only its distance from the axis is fixed — at half the
 * axis length, which makes the third point sit on the short radius.
 */
export function snapAcrossAxis(axisStart: Coordinate, axisEnd: Coordinate, coordinate: Coordinate): Coordinate {
  const ax = axisEnd.x - axisStart.x
  const ay = axisEnd.y - axisStart.y
  const length = Math.hypot(ax, ay)
  if (length === 0) {
    return coordinate
  }
  const nx = -ay / length
  const ny = ax / length
  const side = (coordinate.x - axisStart.x) * nx + (coordinate.y - axisStart.y) * ny < 0 ? -1 : 1
  const along = ((coordinate.x - axisStart.x) * ax + (coordinate.y - axisStart.y) * ay) / length
  const mid = { x: axisStart.x + ax / 2, y: axisStart.y + ay / 2 }
  const reach = along - length / 2
  return {
    x: mid.x + (ax / length) * reach + nx * side * (length / 2),
    y: mid.y + (ay / length) * reach + ny * side * (length / 2)
  }
}

/** The modifier keys a magnet and a drag read live, rather than tracking. */
export interface ModifierKeys {
  shiftKey?: boolean
  metaKey?: boolean
  ctrlKey?: boolean
}

/**
 * The magnet a point is placed with. Meta (Cmd) or Ctrl inverts it while it is
 * held: a tool drawn with the magnet on goes free, and one drawn with it off
 * snaps at the strength the host last picked.
 */
export function invertMagnetMode(mode: OverlayMode, modifiers: ModifierKeys, preferred: Exclude<OverlayMode, 'normal'>): OverlayMode {
  if (modifiers.metaKey !== true && modifiers.ctrlKey !== true) {
    return mode
  }
  return mode === 'normal' ? preferred : 'normal'
}

/**
 * Call the right snap for what Shift means to this tool. A circle has no sides
 * to keep, a box keeps them equal, an ellipse's third point keeps the axis it
 * was handed, and everything else follows a 45° ray from the point before it.
 *
 * `inside` is the index being dragged, so the point to snap around is always
 * read from `points` rather than passed in — a tool at step `n` snaps around
 * the point at `n - 1`, which is the one already committed.
 */
export function snapShapePoint(name: string, points: ReadonlyArray<Nullable<Coordinate>>, inside: number, cursor: Coordinate): Coordinate {
  if (name === 'circle') {
    return cursor
  }
  if (name === 'rect' || name === 'box') {
    // A corner is pulled from the one across the box, so the cursor decides
    // the side and the longer of the two distances decides its length.
    const anchor = points[inside === 0 ? 1 : 0]
    return anchor == null ? cursor : snapToSquare(anchor, cursor)
  }
  if ((name === 'ellipse' || name === 'rotatedRectangle') && inside === 2) {
    const start = points[0]
    const end = points[1]
    return start == null || end == null ? cursor : snapAcrossAxis(start, end, cursor)
  }
  const anchor = points[inside - 1]
  return anchor == null ? cursor : snapToAngles(anchor, cursor)
}
