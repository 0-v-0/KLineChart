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
import type Eventful from '../common/Eventful'
import type { EventHandler, EventName, MouseTouchEvent, MouseTouchEventCallback } from '../common/EventHandler'
import type Nullable from '../common/Nullable'
import type Point from '../common/Point'
import type { TextStyle } from '../common/Styles'
import { UpdateLevel } from '../common/Updater'
import { createFont } from '../common/utils/canvas'
import { isFunction, isNumber, isValid } from '../common/utils/typeChecks'

import type { Axis } from '../component/Axis'
import type OverlayImp from '../component/Overlay'
import type { Overlay, OverlayExtraHandle, OverlayFigure, OverlayMode } from '../component/Overlay'
import { checkOverlayFigureEvent, OVERLAY_FIGURE_KEY_PREFIX } from '../component/Overlay'
import { setDrawingOverlay } from '../component/Figure'
import type Figure from '../component/Figure'
import type { FigureCreate } from '../component/Figure'
import type { YAxis } from '../component/YAxis'
import type { TextAttrs } from '../extension/figure/text'
import { getTextRect } from '../extension/figure/text'
import { constrainToAxis, invertMagnetMode, isDragBeyond, snapShapePoint } from '../extension/overlay/utils'
import type DrawPane from '../pane/DrawPane'
import { PaneIdConstants } from '../pane/types'
import type { EventOverlayInfoFigureType } from '../Store'
import type DrawWidget from '../widget/DrawWidget'

import View from './View'

/**
 * The `zLevel` from which a drawing is painted after the crosshair rather than
 * before it, so the crosshair line runs behind it. Everything below stays in
 * the first pass, which is where every drawing used to be.
 */
export const OVERLAY_Z_LEVEL_ABOVE_CROSSHAIR = 1000

/** Marquee paint. Neutral blue, readable over both chart themes. */
const SELECTION_RECT_FILL = 'rgba(41, 98, 255, 0.12)'
const SELECTION_RECT_STROKE = 'rgba(41, 98, 255, 0.9)'

export default class OverlayView<C extends Axis = YAxis> extends View<C> {
  private _activeTextEditor: Nullable<{
    input: HTMLInputElement | HTMLTextAreaElement
    overlay: OverlayImp
    figure: OverlayFigure
    cleanup: () => void
  }> = null

  /** Where the current drag started, pane-local, for Shift axis-locking. */
  private _pressStart: Nullable<Coordinate> = null

  /**
   * The press that placed a point of the drawing in progress. Dragging from it
   * moves the next point instead of panning, and releasing past
   * `DRAG_DRAW_MIN_PX` places that point — TradingView's press-drag-release,
   * alongside the click-then-click flow.
   */
  private _dragDraw: Nullable<{ overlay: OverlayImp; x: number; y: number; moved: boolean }> = null

  /** The click that ends a press `_dragDraw` already handled. */
  private _swallowClick = false

  /**
   * The rest of the selection, armed by a press on one of the group's bodies so
   * they travel with it; empty unless a group drag is in progress.
   */
  private _coDraggedOverlays: OverlayImp[] = []

  /**
   * Which drawing each hit-testable figure belongs to, and whether it is one of
   * that drawing's handles. Filled while drawing, read by the hit-priority pass
   * in `_drawPass`.
   */
  private readonly _figureOwners = new WeakMap<Eventful, { overlay: OverlayImp; handle: boolean }>()

  /** The drawing whose figures are being created right now; see `createFigure`. */
  private _drawingOwner: Nullable<{ overlay: OverlayImp; handle: boolean }> = null

  constructor(widget: DrawWidget<DrawPane<C>>) {
    super(widget)
    this._initEvent()
  }

  private _initEvent(): void {
    const widget = this.getWidget()
    const pane = widget.getPane()
    const paneId = pane.getId()
    const chart = pane.getChart()
    const chartStore = chart.getChartStore()
    /** Put the drawing's current point at `event` and step to the next; finish it if that was the last. */
    const placePoint = (overlay: OverlayImp, event: MouseTouchEvent): void => {
      overlay.eventMoveForDrawing(this._drawingPoint(overlay, event, chartStore.getPreferredMagnetMode()))
      overlay.onDrawing?.({ chart, overlay, ...event })
      overlay.nextStep()
      if (!overlay.isDrawing()) {
        chartStore.progressOverlayComplete()
        // The tool tidies up what it was given — swapping the two corners so
        // they read top-left to bottom-right, filling in extendData — while it
        // is still the drawing the user made.
        overlay.completeDrawing?.({ chart, overlay })
        overlay.onDrawEnd?.({ chart, overlay, ...event })
        // TradingView-style auto-edit: if the freshly-drawn overlay includes an
        // editableText figure with empty text (i.e. a text annotation), mount
        // the inline editor automatically so the user can start typing without
        // first hovering the 50%-opacity "+ Add text" placeholder.
        this._maybeAutoStartEditingAfterDraw(overlay)
      }
    }
    this.registerEvent('mouseMoveEvent', (event) => {
      const progressOverlayInfo = chartStore.getProgressOverlayInfo()
      if (progressOverlayInfo !== null) {
        const overlay = progressOverlayInfo.overlay
        let progressOverlayPaneId = progressOverlayInfo.paneId
        if (overlay.isStart()) {
          chartStore.updateProgressOverlayInfo(paneId)
          progressOverlayPaneId = paneId
        }
        const index = overlay.points.length - 1
        if (overlay.isDrawing() && progressOverlayPaneId === paneId) {
          overlay.eventMoveForDrawing(this._drawingPoint(overlay, event, chartStore.getPreferredMagnetMode()))
          overlay.onDrawing?.({ chart, overlay, ...event })
        }
        return this._figureMouseMoveEvent(overlay, 'point', index, { key: `${OVERLAY_FIGURE_KEY_PREFIX}point_${index}`, type: 'circle', attrs: {} })(event)
      }
      chartStore.setHoverOverlayInfo(
        {
          paneId,
          overlay: null,
          figureType: 'none',
          figureIndex: -1,
          figure: null
        },
        (o, f) => this._processOverlayMouseEnterEvent(o, f, event),
        (o, f) => this._processOverlayMouseLeaveEvent(o, f, event)
      )
      widget.setForceCursor(null)
      return false
    })
      .registerEvent('mouseClickEvent', (event) => {
        // The press already placed this drawing point; see `mouseDownEvent`.
        if (this._swallowClick) {
          this._swallowClick = false
          return true
        }
        const progressOverlayInfo = chartStore.getProgressOverlayInfo()
        if (progressOverlayInfo !== null) {
          const overlay = progressOverlayInfo.overlay
          let progressOverlayPaneId = progressOverlayInfo.paneId
          if (overlay.isStart()) {
            chartStore.updateProgressOverlayInfo(paneId, true)
            progressOverlayPaneId = paneId
          }
          const index = overlay.points.length - 1
          if (overlay.isDrawing() && progressOverlayPaneId === paneId) {
            placePoint(overlay, event)
          }
          return this._figureMouseClickEvent(overlay, 'point', index, {
            key: `${OVERLAY_FIGURE_KEY_PREFIX}point_${index}`,
            type: 'circle',
            attrs: {}
          })(event)
        }
        chartStore.setClickOverlayInfo(
          {
            paneId,
            overlay: null,
            figureType: 'none',
            figureIndex: -1,
            figure: null
          },
          (o, f) => this._processOverlaySelectedEvent(o, f, event),
          (o, f) => this._processOverlayDeselectedEvent(o, f, event)
        )
        // A click on empty space drops the whole selection — but not when it
        // ends a Cmd/Ctrl-drag, which is the marquee that just built one.
        if (event.metaKey !== true && event.ctrlKey !== true) {
          chartStore.setSelectedOverlayIds([])
        }
        return false
      })
      .registerEvent('mouseDoubleClickEvent', (event) => {
        const progressOverlayInfo = chartStore.getProgressOverlayInfo()
        if (progressOverlayInfo !== null) {
          const overlay = progressOverlayInfo.overlay
          const progressOverlayPaneId = progressOverlayInfo.paneId
          if (overlay.isDrawing() && progressOverlayPaneId === paneId) {
            overlay.forceComplete()
            if (!overlay.isDrawing()) {
              chartStore.progressOverlayComplete()
              // The tool tidies up what it was given — swapping the two
              // corners so they read top-left to bottom-right, filling in
              // extendData — while it is still the drawing the user made.
              overlay.completeDrawing?.({ chart, overlay })
              overlay.onDrawEnd?.({ chart, overlay, ...event })
            }
          }
          const index = overlay.points.length - 1
          return this._figureMouseClickEvent(overlay, 'point', index, {
            key: `${OVERLAY_FIGURE_KEY_PREFIX}point_${index}`,
            type: 'circle',
            attrs: {}
          })(event)
        }
        return false
      })
      .registerEvent('mouseRightClickEvent', (event) => {
        const progressOverlayInfo = chartStore.getProgressOverlayInfo()
        if (progressOverlayInfo !== null) {
          const overlay = progressOverlayInfo.overlay
          if (overlay.isDrawing()) {
            const index = overlay.points.length - 1
            return this._figureMouseRightClickEvent(overlay, 'point', index, {
              key: `${OVERLAY_FIGURE_KEY_PREFIX}point_${index}`,
              type: 'circle',
              attrs: {}
            })(event)
          }
        }
        return false
      })
      .registerEvent('mouseDownEvent', (event) => {
        this._swallowClick = false
        this._dragDraw = null
        // Handle continuous drawing mode - start drawing on mouse down
        const progressOverlayInfo = chartStore.getProgressOverlayInfo()
        if (progressOverlayInfo !== null) {
          const overlay = progressOverlayInfo.overlay
          if (overlay.isContinuousDrawing() && overlay.isStart()) {
            chartStore.updateProgressOverlayInfo(paneId, true)
            const point = this._coordinateToPoint(overlay, event, invertMagnetMode(overlay.mode, event, chartStore.getPreferredMagnetMode()))
            overlay.startContinuousDrawing(point)
            overlay.onDrawStart?.({ chart, overlay, ...event })
            return true
          }
          // A point-by-point drawing takes its point on the press, so a drag
          // from here draws instead of panning. Mouse only: touch places its
          // points with the crosshair-and-tap flow.
          if (event.isTouch !== true && !overlay.isContinuousDrawing() && overlay.isDrawing()) {
            if (overlay.isStart()) {
              chartStore.updateProgressOverlayInfo(paneId, true)
            }
            if (chartStore.getProgressOverlayInfo()?.paneId !== paneId) {
              return false
            }
            placePoint(overlay, event)
            if (overlay.isDrawing()) {
              this._dragDraw = { overlay, x: event.x, y: event.y, moved: false }
            }
            this._swallowClick = true
            return true
          }
        }
        return false
      })
      .registerEvent('mouseUpEvent', (event) => {
        const dragDraw = this._dragDraw
        if (dragDraw !== null) {
          this._dragDraw = null
          // A drag places the next point where it was let go; a press that
          // never travelled leaves it to follow the mouse, as a click does.
          if (dragDraw.moved && dragDraw.overlay.isDrawing()) {
            placePoint(dragDraw.overlay, event)
          }
          return true
        }
        // Handle continuous drawing mode - complete on mouse up
        const progressOverlayInfo = chartStore.getProgressOverlayInfo()
        if (progressOverlayInfo !== null) {
          const overlay = progressOverlayInfo.overlay
          if (overlay.isContinuousDrawing() && overlay.isDrawing() && !overlay.isStart()) {
            overlay.completeContinuousDrawing()
            chartStore.progressOverlayComplete()
            overlay.completeDrawing?.({ chart, overlay })
            overlay.onDrawEnd?.({ chart, overlay, ...event })
            return true
          }
        }
        // Each drawing that came along gets its own `onPressedMoveEnd` (with no
        // figure — it was never itself pressed), so a host's per-drawing save
        // hook fires for all of them and not only for the one that was grabbed.
        if (this._coDraggedOverlays.length > 0) {
          for (const other of this._coDraggedOverlays) {
            other.onPressedMoveEnd?.({ chart, overlay: other, figure: undefined, ...event })
          }
          this._coDraggedOverlays = []
        }
        this._pressStart = null
        const { overlay, figure } = chartStore.getPressedOverlayInfo()
        if (overlay !== null) {
          if (checkOverlayFigureEvent('onPressedMoveEnd', figure)) {
            overlay.onPressedMoveEnd?.({ chart, overlay, figure: figure ?? undefined, ...event })
          }
        }
        chartStore.setPressedOverlayInfo({
          paneId,
          overlay: null,
          figureType: 'none',
          figureIndex: -1,
          figure: null
        })
        return false
      })
      .registerEvent('pressedMouseMoveEvent', (event) => {
        const dragDraw = this._dragDraw
        if (dragDraw !== null) {
          const { overlay } = dragDraw
          if (!overlay.isDrawing()) {
            this._dragDraw = null
            return true
          }
          if (isDragBeyond(dragDraw, event)) {
            dragDraw.moved = true
          }
          overlay.eventMoveForDrawing(this._drawingPoint(overlay, event, chartStore.getPreferredMagnetMode()))
          overlay.onDrawing?.({ chart, overlay, ...event })
          return true
        }
        // Handle continuous drawing mode - accumulate points while mouse is pressed
        const progressOverlayInfo = chartStore.getProgressOverlayInfo()
        if (progressOverlayInfo !== null) {
          const overlay = progressOverlayInfo.overlay
          if (overlay.isContinuousDrawing() && overlay.isDrawing() && !overlay.isStart()) {
            const point = this._coordinateToPoint(overlay, event, invertMagnetMode(overlay.mode, event, chartStore.getPreferredMagnetMode()))
            overlay.addPointForContinuousDrawing(point)
            overlay.onDrawing?.({ chart, overlay, ...event })
            return true
          }
        }
        const { overlay, figureType, figureIndex, figure } = chartStore.getPressedOverlayInfo()
        if (overlay !== null) {
          if (checkOverlayFigureEvent('onPressedMoving', figure)) {
            if (!overlay.lock) {
              // Shift locks a body drag to one axis, and snaps a point handle
              // to a ray from the point before it (to a square, for a box).
              const extraHandle = figureType === 'point' && figureIndex >= overlay.points.length
              const shiftSnapped = event.shiftKey === true && !extraHandle && figureType === 'point'
              let moveEvent = event
              if (event.shiftKey === true && !extraHandle) {
                moveEvent = figureType === 'point' ? { ...event, ...this._shiftSnapPoint(overlay, event, figureIndex) } : this._constrainToDragAxis(event)
              }
              // A magnet pull would fight the snapped geometry, so Shift drops
              // it for a snapped handle — but not for a body drag, where the
              // grab point was magnetised and losing it would make the drawing
              // jump under the hand.
              const mode = shiftSnapped ? 'normal' : invertMagnetMode(overlay.mode, event, chartStore.getPreferredMagnetMode())
              const point = this._coordinateToPoint(overlay, moveEvent, mode)
              // When the pressed figure declares `noTranslate`, the
              // engine skips the default point-translation step
              // entirely — the overlay's `onPressedMoving` handler
              // below owns the drag (typically updating extendData
              // for in-shape resize handles like Table's borders).
              const noTranslate = (figure as { noTranslate?: boolean } | null)?.noTranslate === true
              // A handle past the last point is one the tool draws itself: it
              // has no point to translate, so the tool moves it.
              if (extraHandle) {
                overlay.moveExtraHandle?.({
                  overlay,
                  index: figureIndex - overlay.points.length,
                  coordinate: { x: event.x, y: event.y },
                  coordinates: this._overlayCoordinates(overlay),
                  toPoint: (coordinate) => this._coordinateToPoint(overlay, { ...event, ...coordinate })
                })
              } else if (!noTranslate) {
                if (figureType === 'point') {
                  overlay.eventPressedPointMove(point, figureIndex)
                } else {
                  overlay.eventPressedOtherMove(point, this.getWidget().getPane().getChart().getChartStore())
                  // The rest of the group travels by the same delta, each from
                  // its own snapshot, so the shapes keep their spacing.
                  for (const other of this._coDraggedOverlays) {
                    other.eventPressedOtherMove(this._coordinateToPoint(other, moveEvent), this.getWidget().getPane().getChart().getChartStore())
                  }
                }
              }
              let prevented = false
              // A handle drag lands where the handle landed, not under the
              // pointer: the candle snap, the magnet and the Shift snap all
              // move it. Puts the crosshair on the line the user is shaping.
              if (figureType === 'point') {
                const at = extraHandle ? this._extraHandleCoordinate(overlay, figureIndex) : this._pointToCoordinate(overlay.points[figureIndex])
                this.getWidget().setPinnedCrosshair(at === null ? null : { x: at.x, y: at.y })
              }
              overlay.onPressedMoving?.({
                chart,
                overlay,
                figure: figure ?? undefined,
                ...event,
                preventDefault: () => {
                  prevented = true
                },
                pinCrosshair: (coordinate) => {
                  this.getWidget().setPinnedCrosshair(coordinate)
                }
              })
              // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- ignore
              if (prevented) {
                this.getWidget().setForceCursor(null)
              } else {
                // A handle keeps its own cursor (a resize arrow) through the
                // drag; the pointer is the fallback for a plain body.
                this.getWidget().setForceCursor((figure as { cursor?: string } | null)?.cursor ?? 'pointer')
              }
              return true
            }
          }
        }
        this.getWidget().setForceCursor(null)
        return false
      })
  }

  /**
   * Snap the active text editor to match the figure's current rect.
   * Called from drawFigures every render — handles both zoom / pan
   * during editing (figure's x / y change with the chart coordinate
   * system) and live grow-around-text (figure's width / height
   * change as the overlay rebuilds its figures off updated text).
   *
   * Sizes from the figure's attrs verbatim — including any explicit
   * width / height the overlay pinned to match its visual shape
   * (Callout's bubble does this). Both canvas and textarea route
   * through the same getTextRect call, so they stay in lockstep.
   */
  private _repositionTextEditor(figureAttrs: TextAttrs, styles: Partial<TextStyle>): void {
    if (this._activeTextEditor === null) {
      return
    }
    const { input } = this._activeTextEditor
    const rect = getTextRect(figureAttrs, styles)
    // Engine-wide minimum width for the input — useful for plain
    // Text overlays where the figure's natural rect can be a few
    // pixels wide (just the inline cursor). When the floor kicks in
    // we also recompute the left edge so the textarea stays centred
    // / aligned on attrs.x instead of left-anchored at the unfloored
    // rect.x (which was computed from the smaller natural width).
    const effectiveWidth = Math.max(rect.width, 120)
    let effectiveLeft = rect.x
    if (effectiveWidth !== rect.width) {
      const align = figureAttrs.align ?? 'left'
      if (align === 'center') {
        effectiveLeft = figureAttrs.x - effectiveWidth / 2
      } else if (align === 'right' || align === 'end') {
        effectiveLeft = figureAttrs.x - effectiveWidth
      }
    }
    input.style.left = `${effectiveLeft}px`
    input.style.top = `${rect.y}px`
    input.style.width = `${effectiveWidth}px`
    input.style.height = `${rect.height}px`
    // Re-apply vertical padding each render so figures whose padding
    // is content-derived (e.g. Table cells, which centre their text
    // vertically by computing padding from the row's effective
    // height) keep the textarea's internal cursor / text block
    // vertically aligned with the canvas as the user types and the
    // row grows.
    const pt = styles.paddingTop ?? 0
    const pb = styles.paddingBottom ?? 0
    const pl = styles.paddingLeft ?? 0
    const pr = styles.paddingRight ?? 0
    input.style.padding = `${pt}px ${pr}px ${pb}px ${pl}px`
    // Re-apply text-align too — when the figure's align changes
    // mid-edit (Table's per-table alignment dropdown updates
    // extendData and re-renders), the textarea's CSS text-align
    // would otherwise stay stuck at whatever was set in
    // `_startTextEdit` (frozen at the time of click).
    const figureAlign = figureAttrs.align
    if (figureAlign !== undefined) {
      input.style.textAlign = figureAlign === 'start' ? 'left' : figureAlign === 'end' ? 'right' : figureAlign
    }
    // Line-height tracks the figure styles each frame for the
    // same reason as padding / text-align — content-driven changes
    // (Table cell adding a line) shouldn't drift the textarea
    // off the canvas grid.
    input.style.lineHeight = String(styles.lineHeight ?? 1)
    // Re-apply rotation each render so the textarea tracks the
    // figure's current angle (Price Note's leader text computes a
    // fresh angle every redraw as the user drags the endpoints).
    const angle = (figureAttrs as { angle?: number }).angle
    input.style.transform = angle !== undefined && angle !== 0 ? `rotate(${angle}rad)` : 'none'
  }

  private _stopTextEdit(commit: boolean): void {
    if (this._activeTextEditor === null) {
      return
    }
    const { input, overlay, figure, cleanup } = this._activeTextEditor
    const chart = this.getWidget().getPane().getChart()
    if (commit && isFunction(overlay.onTextChange)) {
      const text = input.value
      const figureKey = figure.key
      overlay.onTextChange({ chart, overlay, figure, figureKey, text, committed: true })
    }
    cleanup()
    this._activeTextEditor = null
    // Re-render overlay so the canvas text figure reappears
    chart.updatePane(UpdateLevel.Overlay)
  }

  private _startTextEdit(overlay: OverlayImp, figure: OverlayFigure, styles: Partial<TextStyle>): void {
    // Stop any existing edit
    this._stopTextEdit(false)

    const attrs = figure.attrs as TextAttrs & { placeholder?: string | null }
    // Use placeholder text for sizing when actual text is empty so
    // the input properly covers the placeholder area on the canvas.
    // Figures that opt out (`placeholder === null`) — e.g. Table
    // cells — keep their own empty `text` for sizing; they already
    // declare explicit width/height on the figure.
    const placeholderText = attrs.placeholder === null ? '' : (attrs.placeholder ?? '+ Add text')
    const sizingAttrs = attrs.text.length === 0 && placeholderText.length > 0 ? { ...attrs, text: placeholderText } : attrs
    const rect = getTextRect(sizingAttrs, styles)

    const container = this.getWidget().getContainer()

    // Textarea (not <input type="text">) so Enter inserts a newline
    // natively — matching TV's Callout / Note behaviour. Single-line
    // overlays still work fine: the textarea reads as one line when
    // no newlines are typed, and the commit path collapses to the
    // same `input.value` either way.
    const input = document.createElement('textarea')
    input.value = attrs.text
    input.placeholder = placeholderText
    // Disable browser features that interfere with looking-like-the-
    // overlay: resize handle, scrollbars (we autosize the rect to
    // fit the typed content), spellcheck red-underline.
    input.spellcheck = false
    input.style.resize = 'none'
    input.style.overflow = 'hidden'

    const { size = 12, weight = 'normal', family, fontStyle, color = '#000000', paddingLeft = 0, paddingTop = 0, paddingRight = 0, paddingBottom = 0 } = styles

    // Border / background / borderRadius for the editor element come
    // from the FIGURE's own styles or an explicit overlay-level
    // override — NOT the engine's default `overlay.text` style. That
    // default carries a blue placeholder border + background which
    // would otherwise leak into the textarea for every overlay (it's
    // invisible on canvas because editableText forces a transparent
    // draw, but the DOM input has no such mask). The result: by
    // default the editor is borderless and transparent. An overlay
    // opts into a border by setting `borderColor` + `borderSize` on
    // its editableText figure's styles; into a fill by setting
    // `backgroundColor`; into rounded corners by setting
    // `borderRadius`.
    const figureOwn = (figure.styles ?? {}) as Record<string, unknown>
    const overlayOwn = (overlay.styles?.text ?? {}) as Record<string, unknown>
    const backgroundColor = (figureOwn.backgroundColor ?? overlayOwn.backgroundColor) as string | undefined
    const borderColor = (figureOwn.borderColor ?? overlayOwn.borderColor) as string | undefined
    const borderSize = (figureOwn.borderSize ?? overlayOwn.borderSize) as number | undefined
    // borderRadius accepts a number (uniform corners in px) or a
    // string (raw CSS shorthand) so per-corner radii like Comment's
    // `'21px 21px 21px 0'` — three rounded corners + one sharp — can
    // be expressed without forcing a number-only API.
    const borderRadius = (figureOwn.borderRadius ?? overlayOwn.borderRadius) as number | string | undefined

    const font = createFont(size, weight, family, fontStyle)

    // Text alignment from the figure attrs — when omitted the input
    // mirrors the canvas drawText default of left-aligned.
    const textAlign = attrs.align ?? 'left'

    // Border: only apply when an opaque border is configured. Default
    // ('none') matches the prior behaviour for plain Text overlays.
    const borderStyle = borderColor !== undefined && borderColor !== 'transparent' && (borderSize ?? 0) > 0 ? `${borderSize ?? 1}px solid ${borderColor}` : 'none'

    // Rotation: if the editableText figure carries `angle`, rotate
    // the textarea around its centre so it visually parallels the
    // canvas-rendered text. transform-origin is the textarea's
    // centre, which coincides with `attrs.x` / `attrs.y` for an
    // align='center', baseline='middle' figure — the only orientation
    // the rotated-text path is currently used for.
    const angle = (attrs as { angle?: number }).angle
    const transform = angle !== undefined && angle !== 0 ? `rotate(${angle}rad)` : 'none'

    Object.assign(input.style, {
      position: 'absolute',
      left: `${rect.x}px`,
      top: `${rect.y}px`,
      width: `${Math.max(rect.width, 120)}px`,
      height: `${rect.height}px`,
      padding: `${paddingTop}px ${paddingRight}px ${paddingBottom}px ${paddingLeft}px`,
      margin: '0',
      border: borderStyle,
      borderRadius: borderRadius !== undefined ? (typeof borderRadius === 'number' ? `${borderRadius}px` : borderRadius) : '0',
      outline: 'none',
      font,
      color,
      backgroundColor: backgroundColor ?? 'transparent',
      textAlign,
      // Unitless line-height multiplier — matches the canvas-side
      // step of `size * lineHeight` so wrapped / multi-line edits
      // sit on the same baselines after commit. Default 1 keeps
      // every existing overlay's behaviour unchanged.
      lineHeight: String(styles.lineHeight ?? 1),
      boxSizing: 'border-box',
      transform,
      transformOrigin: 'center center',
      zIndex: '1000',
      caretColor: color
    })

    const onKeyDown = (e: KeyboardEvent): void => {
      e.stopPropagation()
      // Enter inserts a newline (native textarea behaviour) so the
      // user can write multi-line annotations. Commit is on blur /
      // Escape — neither of those reads the newline as a commit
      // trigger any longer.
      if (e.key === 'Escape') {
        e.preventDefault()
        this._stopTextEdit(false)
      }
    }

    const onBlur = (): void => {
      // setTimeout deferral lets the user click-out-to-commit flow
      // resolve cleanly without racing the editor teardown.
      setTimeout(() => {
        if (this._activeTextEditor?.input === input) {
          this._stopTextEdit(true)
        }
      }, 0)
    }

    // Live commit: each keystroke fires onTextChange so the overlay
    // recomputes its figures (bubble width, polygon outline, etc.)
    // off the typed text, and updatePane triggers a redraw whose
    // drawFigures pass invokes the reposition hook below. The hook
    // reads the FRESH figureAttrs from the just-rebuilt figure (same
    // width / height the canvas just rendered), so the textarea is
    // sized to the bubble's exact current dimensions — no drift
    // between canvas-measured and browser-measured widths.
    //
    // The same redraw → reposition path covers zoom / pan during
    // editing: any chart-coord change triggers the normal canvas
    // redraw, the hook runs, the textarea snaps to follow.
    const chart = this.getWidget().getPane().getChart()
    const figureKeyForInput = figure.key
    const onInput = (): void => {
      const currentText = input.value
      if (isFunction(overlay.onTextChange)) {
        overlay.onTextChange({ chart, overlay, figure, figureKey: figureKeyForInput, text: currentText, committed: false })
      }
      chart.updatePane(UpdateLevel.Overlay)
    }

    input.addEventListener('keydown', onKeyDown)
    input.addEventListener('blur', onBlur)
    input.addEventListener('input', onInput)

    // Prevent chart from handling mouse events on the input
    const stopPropagation = (e: Event): void => {
      e.stopPropagation()
    }
    input.addEventListener('mousedown', stopPropagation)
    input.addEventListener('mouseup', stopPropagation)
    input.addEventListener('click', stopPropagation)

    const cleanup = (): void => {
      input.removeEventListener('keydown', onKeyDown)
      input.removeEventListener('blur', onBlur)
      input.removeEventListener('input', onInput)
      input.removeEventListener('mousedown', stopPropagation)
      input.removeEventListener('mouseup', stopPropagation)
      input.removeEventListener('click', stopPropagation)
      if (input.parentElement != null) {
        input.parentElement.removeChild(input)
      }
    }

    this._activeTextEditor = { input, overlay, figure, cleanup }

    container.appendChild(input)
    input.focus()
    input.select()
  }

  /**
   * Called by the click-driven drawing flow right after the engine has
   * fired `onDrawEnd` for a freshly-completed overlay. If the overlay
   * declares `editTextOnCreate` and exposes an `editableText` figure with
   * empty text, we open the inline editor immediately so the user can start
   * typing — matching TradingView's behaviour for Text/Note/Callout tools.
   *
   * The flag is what keeps the editor to the tools that want it: an empty
   * label is also how a channel or an ellipse starts out, and those should
   * open with nothing over the drawing.
   *
   * Walks the same coordinate computation as `_drawOverlay` so the
   * editor mounts at the figure's actual screen position.
   */
  private _maybeAutoStartEditingAfterDraw(overlay: OverlayImp): void {
    if (!overlay.editTextOnCreate || overlay.createPointFigures == null) {
      return
    }

    const { points } = overlay
    if (points.length === 0) {
      return
    }

    const pane = this.getWidget().getPane()
    const chart = pane.getChart()
    const yAxis = pane.getAxisComponent() as unknown as Nullable<YAxis>
    const xAxis = chart.getXAxisPane().getAxisComponent()
    const bounding = this.getWidget().getBounding()
    const coordinates = this._overlayCoordinates(overlay)

    const figuresRaw = overlay.createPointFigures({ chart, overlay, coordinates, bounding, xAxis, yAxis })
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment -- ignore
    // @ts-expect-error
    const figures: OverlayFigure[] = [].concat(figuresRaw)

    const defaultTextStyles = chart.getStyles().overlay.text

    for (const figure of figures) {
      if (figure.type !== 'editableText') {
        continue
      }
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment -- ignore
      // @ts-expect-error
      const attrsArray: TextAttrs[] = [].concat(figure.attrs)
      const firstEmpty = attrsArray.find((a) => a.text.length === 0)
      if (firstEmpty == null) {
        continue
      }

      // Resolve merged styles the same way drawFigures + the placeholder
      // path do — defaults → overlay.styles.text → per-figure styles.
      // backgroundColor is declared differently in the default styles and in the
      // overlay styles (the latter uses an optional addColorStop), so the merged
      // value has to be narrowed explicitly to TextStyle's CanvasGradient.
      const mergedStyles = {
        ...defaultTextStyles,
        ...(overlay.styles?.text ?? {}),
        ...(figure.styles as Partial<TextStyle> | undefined)
      } as Partial<TextStyle>

      // Build a thin figure wrapper carrying just the empty attrs, so
      // `_startTextEdit` mounts the input at the right spot.
      const editFigure: OverlayFigure = { ...figure, attrs: firstEmpty }
      this._startTextEdit(overlay, editFigure, mergedStyles)
      return
    }
  }

  private _createFigureEvents(overlay: OverlayImp, figureType: EventOverlayInfoFigureType, figureIndex: number, figure: OverlayFigure): Nullable<EventHandler> {
    if (overlay.isDrawing()) {
      return null
    }
    return {
      mouseMoveEvent: this._figureMouseMoveEvent(overlay, figureType, figureIndex, figure),
      mouseDownEvent: this._figureMouseDownEvent(overlay, figureType, figureIndex, figure),
      mouseClickEvent: this._figureMouseClickEvent(overlay, figureType, figureIndex, figure),
      mouseRightClickEvent: this._figureMouseRightClickEvent(overlay, figureType, figureIndex, figure),
      mouseDoubleClickEvent: this._figureMouseDoubleClickEvent(overlay, figureType, figureIndex, figure)
    }
  }

  private _processOverlayMouseEnterEvent(overlay: OverlayImp, figure: Nullable<OverlayFigure>, event: MouseTouchEvent): boolean {
    if (isFunction(overlay.onMouseEnter) && checkOverlayFigureEvent('onMouseEnter', figure)) {
      overlay.onMouseEnter({ chart: this.getWidget().getPane().getChart(), overlay, figure: figure ?? undefined, ...event })
      return true
    }
    return false
  }

  private _processOverlayMouseLeaveEvent(overlay: OverlayImp, figure: Nullable<OverlayFigure>, event: MouseTouchEvent): boolean {
    if (isFunction(overlay.onMouseLeave) && checkOverlayFigureEvent('onMouseLeave', figure)) {
      overlay.onMouseLeave({ chart: this.getWidget().getPane().getChart(), overlay, figure: figure ?? undefined, ...event })
      return true
    }
    return false
  }

  private _processOverlaySelectedEvent(overlay: OverlayImp, figure: Nullable<OverlayFigure>, event: MouseTouchEvent): boolean {
    if (checkOverlayFigureEvent('onSelected', figure)) {
      overlay.onSelected?.({ chart: this.getWidget().getPane().getChart(), overlay, figure: figure ?? undefined, ...event })
      return true
    }
    return false
  }

  private _processOverlayDeselectedEvent(overlay: OverlayImp, figure: Nullable<OverlayFigure>, event: MouseTouchEvent): boolean {
    if (checkOverlayFigureEvent('onDeselected', figure)) {
      overlay.onDeselected?.({ chart: this.getWidget().getPane().getChart(), overlay, figure: figure ?? undefined, ...event })
      return true
    }
    return false
  }

  private _figureMouseMoveEvent(overlay: OverlayImp, figureType: EventOverlayInfoFigureType, figureIndex: number, figure: OverlayFigure): MouseTouchEventCallback {
    return (event: MouseTouchEvent) => {
      const pane = this.getWidget().getPane()
      const check = !overlay.isDrawing() && checkOverlayFigureEvent('onMouseMove', figure)
      if (check) {
        let prevented = false
        overlay.onMouseMove?.({
          chart: pane.getChart(),
          overlay,
          figure,
          ...event,
          preventDefault: () => {
            prevented = true
          }
        })
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- ignore
        if (prevented) {
          this.getWidget().setForceCursor(null)
        } else {
          // Per-figure cursor override — when a figure declares its
          // own `cursor` (e.g. Table column borders set 'col-resize',
          // row borders set 'row-resize'), use it instead of the
          // default pointer. Communicates resize-affordance without
          // each overlay having to wire its own onMouseMove.
          const figureCursor = (figure as { cursor?: string }).cursor
          this.getWidget().setForceCursor(figureCursor ?? 'pointer')
        }
      }

      pane
        .getChart()
        .getChartStore()
        .setHoverOverlayInfo(
          { paneId: pane.getId(), overlay, figureType, figure, figureIndex },
          (o, f) => this._processOverlayMouseEnterEvent(o, f, event),
          (o, f) => this._processOverlayMouseLeaveEvent(o, f, event)
        )
      return check
    }
  }

  private _figureMouseDownEvent(overlay: OverlayImp, figureType: EventOverlayInfoFigureType, figureIndex: number, figure: OverlayFigure): MouseTouchEventCallback {
    return (event: MouseTouchEvent) => {
      if (overlay.lock) {
        return false
      }
      const pane = this.getWidget().getPane()
      const paneId = pane.getId()
      const chartStore = pane.getChart().getChartStore()
      this._pressStart = { x: event.x, y: event.y }
      overlay.startPressedMove(this._coordinateToPoint(overlay, event))

      // Multi-selection drag: grabbing the *body* (not a single point handle) of
      // a drawing that is part of a group arms every other selected drawing in
      // the same pane to travel alongside it. Each takes its own snapshot so it
      // translates from its own starting point, exactly as a lone drag would.
      this._coDraggedOverlays = []
      if (figureType === 'other' && !overlay.lock) {
        const selectedIds = chartStore.getSelectedOverlayIds()
        if (selectedIds.includes(overlay.id) && selectedIds.length > 1) {
          for (const id of selectedIds) {
            if (id === overlay.id) {
              continue
            }
            const other = chartStore.getOverlaysByFilter({ id, paneId })[0]
            if (other === undefined || other.lock) {
              continue
            }
            other.startPressedMove(this._coordinateToPoint(other, event))
            this._coDraggedOverlays.push(other)
          }
        }
      }

      if (checkOverlayFigureEvent('onPressedMoveStart', figure)) {
        overlay.onPressedMoveStart?.({ chart: pane.getChart(), overlay, figure, ...event })
        chartStore.setPressedOverlayInfo({ paneId, overlay, figureType, figureIndex, figure })
        return !overlay.isDrawing()
      }
      return false
    }
  }

  private _figureMouseClickEvent(overlay: OverlayImp, figureType: EventOverlayInfoFigureType, figureIndex: number, figure: OverlayFigure): MouseTouchEventCallback {
    return (event: MouseTouchEvent) => {
      const pane = this.getWidget().getPane()
      const paneId = pane.getId()
      const chart = pane.getChart()
      const chartStore = chart.getChartStore()
      const check = !overlay.isDrawing() && checkOverlayFigureEvent('onClick', figure)

      // If overlay is already selected and user clicks on editableText, start inline editing
      const wasSelected = chartStore.getClickOverlayInfo().overlay?.id === overlay.id
      if (wasSelected && figure.type === 'editableText' && isFunction(overlay.onTextChange)) {
        const defaultStyles = chart.getStyles().overlay
        const figureKey = figure.key ?? (figure.attrs as TextAttrs).key
        let keyedStyles = figureKey != null && figureKey !== '' ? (overlay.figureStyles[figureKey] as Record<string, unknown> | undefined) : undefined
        if (keyedStyles == null && figureKey != null && figureKey !== '') {
          for (const fKey of Object.keys(overlay.figureStyles)) {
            if (figureKey.startsWith(fKey + '_')) {
              keyedStyles = overlay.figureStyles[fKey] as Record<string, unknown> | undefined
              break
            }
          }
        }
        const styles: Partial<TextStyle> = {
          ...(defaultStyles.text as Partial<TextStyle>),
          ...(overlay.styles?.text as Partial<TextStyle>),
          ...(figure.styles as Partial<TextStyle>),
          ...keyedStyles
        }
        this._startTextEdit(overlay, figure, styles)
        return true
      }

      if (check) {
        overlay.onClick?.({ chart, overlay, figure, ...event })
      }

      // Cmd/Ctrl-click extends the selection instead of replacing it, and
      // leaves `clickOverlayInfo` alone so the additions don't each become "the"
      // selected drawing. A plain click collapses the selection to just this one.
      if (event.metaKey === true || event.ctrlKey === true) {
        chartStore.toggleSelectedOverlayId(overlay.id)
        return check
      }
      chartStore.setSelectedOverlayIds([overlay.id])

      chartStore.setClickOverlayInfo(
        { paneId, overlay, figureType, figureIndex, figure },
        (o, f) => this._processOverlaySelectedEvent(o, f, event),
        (o, f) => this._processOverlayDeselectedEvent(o, f, event)
      )
      return check
    }
  }

  private _figureMouseDoubleClickEvent(overlay: OverlayImp, _figureType: EventOverlayInfoFigureType, _figureIndex: number, figure: OverlayFigure): MouseTouchEventCallback {
    return (event: MouseTouchEvent) => {
      if (checkOverlayFigureEvent('onDoubleClick', figure)) {
        overlay.onDoubleClick?.({ ...event, chart: this.getWidget().getPane().getChart(), figure, overlay })
        return !overlay.isDrawing()
      }
      return false
    }
  }

  private _figureMouseRightClickEvent(overlay: OverlayImp, _figureType: EventOverlayInfoFigureType, _figureIndex: number, figure: OverlayFigure): MouseTouchEventCallback {
    return (event: MouseTouchEvent) => {
      if (checkOverlayFigureEvent('onRightClick', figure)) {
        let prevented = false
        overlay.onRightClick?.({
          chart: this.getWidget().getPane().getChart(),
          overlay,
          figure,
          ...event,
          preventDefault: () => {
            prevented = true
          }
        })
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- ignore
        if (!prevented) {
          this.getWidget().getPane().getChart().getChartStore().removeOverlay(overlay)
        }
        return !overlay.isDrawing()
      }
      return false
    }
  }

  /**
   * Whichever axis the cursor has travelled further along wins, measured from
   * where the press landed.
   */
  private _constrainToDragAxis(event: MouseTouchEvent): MouseTouchEvent {
    const start = this._pressStart
    if (start === null) {
      return event
    }
    return { ...event, ...constrainToAxis(start, event) }
  }

  /**
   * Where the moving point of a drawing goes, and the magnet it goes with.
   * Shift pulls it onto a ray from the point committed before it — the same
   * gesture a handle gets, on the point that tracks the cursor — and switches
   * the magnet off underneath it, since a pull would fight the snapped
   * geometry. The first click has no point behind it, so it stays put.
   */
  private _drawingPoint(overlay: OverlayImp, event: MouseTouchEvent, preferred: Exclude<OverlayMode, 'normal'>): Partial<Point> {
    const snapped = event.shiftKey === true && overlay.isDrawing() && overlay.currentStep > 1
    const coordinate = snapped ? this._shiftSnapPoint(overlay, event, overlay.currentStep - 1) : event
    const mode = snapped ? 'normal' : invertMagnetMode(overlay.mode, event, preferred)
    return this._coordinateToPoint(overlay, coordinate, mode)
  }

  /** Shift on a point handle: the tool's name picks what "straight" means. */
  private _shiftSnapPoint(overlay: OverlayImp, event: MouseTouchEvent, figureIndex: number): Coordinate {
    const points = overlay.points.map((point) => this._pointToCoordinate(point))
    return snapShapePoint(overlay.name, points, figureIndex, { x: event.x, y: event.y })
  }

  private _coordinateToPoint(o: Overlay, coordinate: Coordinate, mode: OverlayMode = o.mode): Partial<Point> {
    const point: Partial<Point> = {}
    const pane = this.getWidget().getPane()
    const chart = pane.getChart()
    const paneId = pane.getId()
    const chartStore = chart.getChartStore()
    if (this.coordinateToPointTimestampDataIndexFlag()) {
      const overlayImp = o as OverlayImp
      if (overlayImp.isContinuousDrawing() && !overlayImp.isStart()) {
        // For continuous drawing, store precise timestamp for sub-bar positioning
        const floatIndex = chartStore.coordinateToFloatIndex(coordinate.x)
        point.dataIndex = floatIndex
        point.timestamp = chartStore.floatIndexToTimestamp(floatIndex) ?? undefined
      } else {
        // For step-based drawing, snap to candle boundaries
        const xAxis = chart.getXAxisPane().getAxisComponent()
        const dataIndex = xAxis.convertFromPixel(coordinate.x)
        point.dataIndex = dataIndex
        point.timestamp = chartStore.dataIndexToTimestamp(dataIndex) ?? undefined
      }
    }
    if (this.coordinateToPointValueFlag()) {
      const yAxis = pane.getYAxisComponentById()
      let value = yAxis.convertFromPixel(coordinate.y)
      if (mode !== 'normal' && paneId === PaneIdConstants.CANDLE && isNumber(point.dataIndex)) {
        const kLineData = chartStore.getDataByDataIndex(point.dataIndex)
        if (kLineData !== null) {
          // ALTD-1898 — both magnet modes now share one code
          // path: find the closest of {open, high, low, close}
          // by pixel distance from the cursor. Strong mode
          // always snaps to that point; weak mode only snaps
          // when the pixel distance is within `modeSensitivity`
          // px, otherwise the raw cursor value passes through.
          //
          // The old asymmetric implementation was strong-inside
          // / weak-outside: cursor between low and high always
          // snapped hard regardless of mode, and the weak halo
          // only existed above/below the wick. That mismatch is
          // why weak "barely snapped" — most cursor positions
          // that felt near an OHLC were inside the range where
          // the mode gate did nothing.
          const cursorY = coordinate.y
          const candidates: Array<{ value: number; pixel: number }> = [
            { value: kLineData.open, pixel: yAxis.convertToPixel(kLineData.open) },
            { value: kLineData.high, pixel: yAxis.convertToPixel(kLineData.high) },
            { value: kLineData.low, pixel: yAxis.convertToPixel(kLineData.low) },
            { value: kLineData.close, pixel: yAxis.convertToPixel(kLineData.close) }
          ]
          let nearest = candidates[0]
          let nearestDist = Math.abs(cursorY - nearest.pixel)
          for (let i = 1; i < candidates.length; i++) {
            const dist = Math.abs(cursorY - candidates[i].pixel)
            if (dist < nearestDist) {
              nearest = candidates[i]
              nearestDist = dist
            }
          }
          if (mode === 'strong_magnet' || nearestDist <= o.modeSensitivity) {
            value = nearest.value
          }
        }
      }
      point.value = value
    }
    return point
  }

  protected coordinateToPointValueFlag(): boolean {
    return true
  }

  protected coordinateToPointTimestampDataIndexFlag(): boolean {
    return true
  }

  override dispatchEvent(name: EventName, event: MouseTouchEvent): boolean {
    const isDrawing = this.getWidget().getPane().getChart().getChartStore().isOverlayDrawing()
    if (isDrawing) {
      return this.onEvent(name, event)
    }
    if (name === 'mouseClickEvent' && this._cycleSelection(event)) {
      return true
    }
    return super.dispatchEvent(name, event)
  }

  /**
   * Overlapping drawings: a plain click where the selected drawing and others
   * are hit selects the next one below the selected one in paint order
   * (wrapping to the top), so repeated clicks walk the stack. Without it a
   * drawing under another can never be selected, since the topmost always
   * takes the click. A click that misses the selected drawing, lands on a
   * handle, or adds to the selection is left to the normal path.
   */
  private _cycleSelection(event: MouseTouchEvent): boolean {
    if (event.metaKey === true || event.ctrlKey === true || event.shiftKey === true) {
      return false
    }
    const chartStore = this.getWidget().getPane().getChart().getChartStore()
    const selected = chartStore.getClickOverlayInfo().overlay
    if (!isValid(selected)) {
      return false
    }
    const hits = new Map<string, { overlay: OverlayImp; figure: Eventful }>()
    const children = this.getChildren()
    let first = true
    for (let i = children.length - 1; i > -1; i--) {
      const child = children[i]
      const owner = this._figureOwners.get(child)
      if (owner === undefined || !child.checkEventOn(event)) {
        continue
      }
      if (first && owner.handle) {
        return false
      }
      first = false
      if (owner.handle || hits.has(owner.overlay.id)) {
        continue
      }
      hits.set(owner.overlay.id, { overlay: owner.overlay, figure: child })
    }
    if (hits.size < 2 || !hits.has(selected.id)) {
      return false
    }
    // Topmost first, by paint order: handles are raised (see `_drawPass`), so
    // dispatch order does not say which drawing is on top.
    const order = this.getCompleteOverlays()
    const stack = [...hits.values()].sort((a, b) => order.indexOf(b.overlay) - order.indexOf(a.overlay))
    const at = stack.findIndex((hit) => hit.overlay.id === selected.id)
    const next = stack[(at + 1) % stack.length]
    next.figure.dispatchEvent('mouseClickEvent', event)
    return true
  }

  override drawImp(ctx: CanvasRenderingContext2D): void {
    this._drawPass(ctx, false)
    this._drawSelectionRect(ctx)
  }

  /**
   * The marquee being dragged, if it belongs to this pane. Nothing is drawn
   * until the press has moved a pixel, so a Cmd-click does not flash a box.
   */
  private _drawSelectionRect(ctx: CanvasRenderingContext2D): void {
    const pane = this.getWidget().getPane()
    const rect = pane.getChart().getChartStore().getOverlaySelectionRect()
    if (rect === null || rect.paneId !== pane.getId()) {
      return
    }
    const x = Math.min(rect.x1, rect.x2)
    const y = Math.min(rect.y1, rect.y2)
    const width = Math.abs(rect.x2 - rect.x1)
    const height = Math.abs(rect.y2 - rect.y1)
    if (width < 1 && height < 1) {
      return
    }
    ctx.save()
    ctx.fillStyle = SELECTION_RECT_FILL
    ctx.strokeStyle = SELECTION_RECT_STROKE
    ctx.lineWidth = 1
    ctx.fillRect(x, y, width, height)
    // The half-pixel offset keeps the 1px border crisp instead of letting it
    // straddle two device pixels.
    ctx.strokeRect(x + 0.5, y + 0.5, width - 1, height - 1)
    ctx.restore()
  }

  /**
   * Second pass, run by the widget after the crosshair: the overlays at
   * `OVERLAY_Z_LEVEL_ABOVE_CROSSHAIR` or higher, so the crosshair line runs
   * behind them instead of through them. Does not clear, so the figures the
   * first pass drew stay where they are.
   */
  drawAboveCrosshair(ctx: CanvasRenderingContext2D): void {
    this._drawPass(ctx, true)
  }

  private _drawPass(ctx: CanvasRenderingContext2D, aboveCrosshair: boolean): void {
    // Scopes the hit-area debug halo to the overlays: with `setHitAreaDebug`
    // on, a candle or an indicator does not get one, so what the halo shows
    // is the tolerance of the figures that are actually draggable.
    setDrawingOverlay(true)
    try {
      const chartStore = this.getWidget().getPane().getChart().getChartStore()
      const overlays = this.getCompleteOverlays()
      // Hit priority without changing what paints on top: the handles of the
      // selected drawings, and then of the hovered one, are hit-tested before
      // everything else in this pass. Otherwise a drawing painted above the
      // selected one takes the press on the selected one's handle, and the
      // drag moves the wrong drawing. Handles only — raising a whole selected
      // drawing let one with a large hit area cover every other drawing, so
      // none of them could be clicked.
      const selectedId = chartStore.getClickOverlayInfo().overlay?.id
      const hoveredId = chartStore.getHoverOverlayInfo().overlay?.id
      const raisedSelected = new Set<Eventful>()
      const raisedHovered = new Set<Eventful>()
      overlays.forEach((overlay) => {
        // `zLevel` is opt-in: a drawing that does not ask to sit above the
        // crosshair stays in the first pass, which is where they all were.
        if (chartStore.isOverlayShown(overlay) && overlay.zLevel >= OVERLAY_Z_LEVEL_ABOVE_CROSSHAIR === aboveCrosshair) {
          const start = this.getChildren().length
          this._drawOverlay(ctx, overlay)
          const selected = overlay.id === selectedId || chartStore.isOverlaySelected(overlay.id)
          if (!selected && overlay.id !== hoveredId) {
            return
          }
          const handles = this.getChildren()
            .slice(start)
            .filter((child) => this._figureOwners.get(child)?.handle === true)
          handles.forEach((child) => (selected ? raisedSelected : raisedHovered).add(child))
        }
      })
      this.raiseChildren(raisedSelected)
      this.raiseChildren(raisedHovered)

      // The drawing in progress belongs under the crosshair: the user is
      // placing its points with the crosshair, so it must not cover them.
      const progressOverlay = this.getProgressOverlay()
      if (!aboveCrosshair && isValid(progressOverlay) && chartStore.isOverlayShown(progressOverlay)) {
        this._drawOverlay(ctx, progressOverlay)
      }
    } finally {
      setDrawingOverlay(false)
    }
  }

  /**
   * Each point's position on the canvas. A continuous drawing keeps the
   * sub-bar index so a stroke follows the cursor between two candles;
   * everything else snaps to a bar. Used for the figures and, again, for the
   * handle drag, so both agree on where a point is.
   */
  private _overlayCoordinates(overlay: OverlayImp): Coordinate[] {
    // For continuous drawing overlays, use float indices for smooth rendering
    const isContinuous = overlay.isContinuousDrawing()
    return overlay.points.map((point) => this._positionOf(point, isContinuous))
  }

  /** Where one point of a drawing (or of its tool-drawn handles) sits on screen. */
  private _pointToCoordinate(point: Partial<Point> | undefined): Nullable<Coordinate> {
    return point === undefined ? null : this._positionOf(point, false)
  }

  /** Where a handle the tool draws for itself sits right now. */
  private _extraHandleCoordinate(overlay: OverlayImp, figureIndex: number): Nullable<Coordinate> {
    const handles = overlay.createExtraHandles?.({ overlay, coordinates: this._overlayCoordinates(overlay) })
    const handle = handles?.[figureIndex - overlay.points.length]
    return handle === undefined ? null : { x: handle.x, y: handle.y }
  }

  private _positionOf(point: Partial<Point>, isContinuous: boolean): Coordinate {
    const pane = this.getWidget().getPane()
    const chartStore = pane.getChart().getChartStore()
    const yAxis = pane.getAxisComponent() as unknown as Nullable<YAxis>
    let dataIndex: Nullable<number> = null
    if (isContinuous && isNumber(point.timestamp)) {
      // Use timestampToFloatIndex for sub-bar precision
      dataIndex = chartStore.timestampToFloatIndex(point.timestamp)
    } else if (isNumber(point.timestamp)) {
      // For regular overlays, use integer timestamp lookup
      dataIndex = chartStore.timestampToDataIndex(point.timestamp)
    } else if (isNumber(point.dataIndex)) {
      // Fallback to dataIndex if no timestamp
      dataIndex = point.dataIndex
    }
    const coordinate = { x: 0, y: 0 }
    if (isNumber(dataIndex)) {
      coordinate.x = chartStore.dataIndexToCoordinate(dataIndex)
    }
    if (isNumber(point.value)) {
      coordinate.y = yAxis?.convertToPixel(point.value) ?? 0
    }
    return coordinate
  }

  private _drawOverlay(ctx: CanvasRenderingContext2D, overlay: OverlayImp): void {
    const coordinates = this._overlayCoordinates(overlay)
    if (coordinates.length > 0) {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment -- ignore
      // @ts-expect-error
      const figures = [].concat(this.getFigures(overlay, coordinates))
      // Everything created in here is the drawing's shape, not a handle.
      this._drawingOwner = { overlay, handle: false }
      try {
        this.drawFigures(ctx, overlay, figures)
        this._drawEditableTextPlaceholders(ctx, overlay, figures)
      } finally {
        this._drawingOwner = null
      }
    }
    this._drawingOwner = { overlay, handle: true }
    try {
      this.drawDefaultFigures(ctx, overlay, coordinates)
    } finally {
      this._drawingOwner = null
    }
  }

  /** A figure is created: remember whose it is, so the hit order can be sorted by owner. */
  protected override createFigure(create: FigureCreate, eventHandler?: EventHandler): Nullable<Figure> {
    const figure = super.createFigure(create, eventHandler)
    if (figure !== null && isValid(eventHandler) && this._drawingOwner !== null) {
      this._figureOwners.set(figure as unknown as Eventful, this._drawingOwner)
    }
    return figure
  }

  /**
   * Draw "+ Add text" placeholder for editableText figures that have empty text,
   * but only when the overlay is both selected (clicked) and hovered.
   * This mirrors TradingView's UX: an affordance appears only when the user
   * is actively interacting with the overlay.
   */
  private _drawEditableTextPlaceholders(ctx: CanvasRenderingContext2D, overlay: OverlayImp, figures: OverlayFigure[]): void {
    const chartStore = this.getWidget().getPane().getChart().getChartStore()
    const hoverOverlayInfo = chartStore.getHoverOverlayInfo()
    const clickOverlayInfo = chartStore.getClickOverlayInfo()

    const isSelected = clickOverlayInfo.overlay?.id === overlay.id
    const isHovered = hoverOverlayInfo.overlay?.id === overlay.id

    if (!isSelected || !isHovered) {
      return
    }

    // Don't draw placeholders while actively editing text
    if (this._activeTextEditor !== null && this._activeTextEditor.overlay.id === overlay.id) {
      return
    }

    const defaultStyles = this.getWidget().getPane().getChart().getStyles().overlay

    figures.forEach((figure) => {
      if (figure.type !== 'editableText') {
        return
      }

      // eslint-disable-next-line @typescript-eslint/ban-ts-comment -- ignore
      // @ts-expect-error
      const attrsArray: TextAttrs[] = [].concat(figure.attrs)
      attrsArray.forEach((attrs) => {
        if (attrs.text.length > 0) {
          return
        }
        // Honour explicit opt-out: figures (e.g. Table cells) can
        // suppress the canvas placeholder by setting attrs.placeholder
        // to null. They still get a usable click target through the
        // figure's explicit width/height.
        if ((attrs as { placeholder?: string | null }).placeholder === null) {
          return
        }

        // Build merged styles the same way drawFigures does
        const figureKey = figure.key
        const attrKey = (attrs as { key?: string }).key
        const effectiveKey = attrKey ?? figureKey
        let keyedStyles = effectiveKey != null && effectiveKey !== '' ? (overlay.figureStyles[effectiveKey] as Record<string, unknown> | undefined) : undefined
        if (keyedStyles == null && effectiveKey != null && effectiveKey !== '') {
          for (const fKey of Object.keys(overlay.figureStyles)) {
            if (effectiveKey.startsWith(fKey + '_')) {
              keyedStyles = overlay.figureStyles[fKey] as Record<string, unknown> | undefined
              break
            }
          }
        }

        // eslint-disable-next-line @typescript-eslint/ban-ts-comment -- ignore
        // @ts-expect-error
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- ignore
        const baseStyles = { ...defaultStyles.text, ...overlay.styles?.text, ...figure.styles, ...keyedStyles }
        const mergedStyles = baseStyles as Partial<TextStyle>

        // Derive a dimmed placeholder color: 50% opacity of the text color
        const baseColor: string = mergedStyles.color ?? '#FFFFFF'
        const placeholderColor = this._dimColor(baseColor, 0.5)

        const placeholderAttrs: TextAttrs = {
          x: attrs.x,
          y: attrs.y,
          text: '+ Add text',
          align: attrs.align,
          baseline: attrs.baseline
        }

        const placeholderStyles: Partial<TextStyle> = {
          ...mergedStyles,
          color: placeholderColor,
          backgroundColor: 'transparent',
          borderColor: 'transparent',
          borderSize: 0
        }

        this.createFigure({
          name: 'text',
          attrs: placeholderAttrs,
          styles: placeholderStyles
        })?.draw(ctx)
      })
    })
  }

  /**
   * Return a CSS color string at reduced opacity.
   * Handles hex (#RGB, #RRGGBB) and rgb/rgba strings.
   * Falls back to 'rgba(255,255,255,0.5)' for unrecognised formats.
   */
  private _dimColor(color: string, opacity: number): string {
    const trimmed = color.trim()

    // hex shorthand #RGB
    const hex3 = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(trimmed)
    if (hex3 !== null) {
      const r = parseInt(hex3[1] + hex3[1], 16)
      const g = parseInt(hex3[2] + hex3[2], 16)
      const b = parseInt(hex3[3] + hex3[3], 16)
      return `rgba(${r},${g},${b},${opacity})`
    }

    // hex full #RRGGBB
    const hex6 = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(trimmed)
    if (hex6 !== null) {
      const r = parseInt(hex6[1], 16)
      const g = parseInt(hex6[2], 16)
      const b = parseInt(hex6[3], 16)
      return `rgba(${r},${g},${b},${opacity})`
    }

    // rgb(r, g, b)
    const rgbMatch = /^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/.exec(trimmed)
    if (rgbMatch !== null) {
      return `rgba(${rgbMatch[1]},${rgbMatch[2]},${rgbMatch[3]},${opacity})`
    }

    // rgba(r, g, b, a) — replace existing alpha
    const rgbaMatch = /^rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,[\d.]+\)$/.exec(trimmed)
    if (rgbaMatch !== null) {
      return `rgba(${rgbaMatch[1]},${rgbaMatch[2]},${rgbaMatch[3]},${opacity})`
    }

    return `rgba(255,255,255,${opacity})`
  }

  protected drawFigures(ctx: CanvasRenderingContext2D, overlay: OverlayImp, figures: OverlayFigure[]): void {
    const defaultStyles = this.getWidget().getPane().getChart().getStyles().overlay
    figures.forEach((figure, figureIndex) => {
      const { type, key: figureKey, styles, attrs } = figure
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment -- ignore
      // @ts-expect-error
      const attrsArray = [].concat(attrs)
      attrsArray.forEach((ats) => {
        // Per-figure point ownership: when a figure declares `pointIndex`,
        // dragging it moves only that point (e.g. Callout's bubble rect
        // owns point 1 — its centre — so dragging the bubble doesn't
        // also drag the anchor). Default is 'other' = translate all
        // points by cursor delta, preserving the engine's prior
        // behaviour for every overlay that doesn't opt in.
        const ownPointIndex = (figure as { pointIndex?: number }).pointIndex
        const events = typeof ownPointIndex === 'number' ? this._createFigureEvents(overlay, 'point', ownPointIndex, figure) : this._createFigureEvents(overlay, 'other', figureIndex, figure)
        // Support per-attr key for granular styling (e.g., each Fibonacci level)
        // Attr key takes precedence over figure key
        const attrKey = (ats as { key?: string }).key
        const effectiveKey = attrKey ?? figureKey
        let keyedStyles = effectiveKey != null && effectiveKey !== '' ? (overlay.figureStyles[effectiveKey] as Record<string, unknown> | undefined) : undefined
        // Prefix-match fallback: for composite keys like 'fan_0.5_grid_x', check 'fan_0.5'
        if (keyedStyles == null && effectiveKey != null && effectiveKey !== '') {
          for (const fKey of Object.keys(overlay.figureStyles)) {
            if (effectiveKey.startsWith(fKey + '_')) {
              keyedStyles = overlay.figureStyles[fKey] as Record<string, unknown> | undefined
              break
            }
          }
        }
        // Style merge order: defaults < instance styles < figure styles < keyed figureStyles
        // figureStyles override inline styles so per-figure customization always wins
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment -- ignore
        // @ts-expect-error
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- ignore
        const ss = { ...defaultStyles[type], ...overlay.styles?.[type], ...styles, ...keyedStyles }
        // Skip drawing editableText figures while the overlay is
        // being edited. The live-resize path replaces figure objects
        // each render, so a `figure === figure` identity check would
        // let the stale-then-new editableText draw behind the
        // textarea on every keystroke; an overlay-id match is the
        // right granularity.
        //
        // We ALSO use this render pass to snap the textarea to the
        // figure's current screen coordinates — that's what makes
        // zoom / pan during editing keep the textarea aligned with
        // the bubble (every chart-coord change triggers a redraw,
        // drawFigures walks here with the figure's updated attrs,
        // and the reposition reads off them before bailing out of
        // the draw).
        if (type === 'editableText' && this._activeTextEditor !== null && this._activeTextEditor.overlay.id === overlay.id) {
          // When the overlay carries multiple editableText figures
          // (e.g. Table cells), an overlay-id match alone would
          // suppress every cell while one is edited AND repos the
          // textarea onto whichever cell drew last. Disambiguate by
          // figure key: only the ACTIVE cell skips draw + repos the
          // textarea; every other cell draws normally so existing
          // content stays visible during the edit.
          const activeKey = this._activeTextEditor.figure.key ?? (this._activeTextEditor.figure.attrs as { key?: string }).key
          const currentKey = figureKey ?? (ats as { key?: string }).key
          if (activeKey === undefined || activeKey === currentKey) {
            this._repositionTextEditor(ats as TextAttrs, ss as Partial<TextStyle>)
            return
          }
        }
        this.createFigure(
          {
            name: type,
            attrs: ats,
            styles: ss
          },
          events ?? undefined
        )?.draw(ctx)
      })
    })
  }

  protected getCompleteOverlays(): OverlayImp[] {
    const pane = this.getWidget().getPane()
    return pane.getChart().getChartStore().getOverlaysByPaneId(pane.getId())
  }

  protected getProgressOverlay(): Nullable<OverlayImp> {
    const pane = this.getWidget().getPane()
    const info = pane.getChart().getChartStore().getProgressOverlayInfo()
    if (isValid(info) && info.paneId === pane.getId()) {
      return info.overlay
    }
    return null
  }

  protected getFigures(o: Overlay, coordinates: Coordinate[]): OverlayFigure | OverlayFigure[] {
    const widget = this.getWidget()
    const pane = widget.getPane()
    const chart = pane.getChart()
    const yAxis = pane.getYAxisComponentById() as unknown as Nullable<YAxis>
    const xAxis = chart.getXAxisPane().getXAxisComponent()
    const bounding = widget.getBounding()
    return o.createPointFigures?.({ chart, overlay: o, coordinates, bounding, xAxis, yAxis }) ?? []
  }

  protected drawDefaultFigures(ctx: CanvasRenderingContext2D, overlay: OverlayImp, coordinates: Coordinate[]): void {
    const need = overlay.needDefaultPointFigure
    // Whitelist when supplied (number[]): only render default handles
    // for the listed point indices. Otherwise truthy renders all,
    // falsy renders none — preserving prior boolean behaviour.
    const allowedIndices: Set<number> | null = Array.isArray(need) ? new Set(need) : null
    if (need) {
      const chartStore = this.getWidget().getPane().getChart().getChartStore()
      const hoverOverlayInfo = chartStore.getHoverOverlayInfo()
      const clickOverlayInfo = chartStore.getClickOverlayInfo()
      if (
        (hoverOverlayInfo.overlay?.id === overlay.id && hoverOverlayInfo.figureType !== 'none') ||
        (clickOverlayInfo.overlay?.id === overlay.id && clickOverlayInfo.figureType !== 'none') ||
        // Part of a multi-selection (Cmd-click or marquee): show the same
        // handles a single click gives, so what is about to be moved or
        // deleted is visible.
        chartStore.isOverlaySelected(overlay.id)
      ) {
        const defaultStyles = chartStore.getStyles().overlay
        const styles = overlay.styles
        // Derive point color from overlay's line/border color so points match the overlay
        const overlayAny = overlay as unknown as Record<string, unknown>
        let baseColor: string | undefined = (styles?.line as Record<string, unknown> | undefined)?.color as string | undefined
        if (baseColor == null && typeof overlayAny.getProperties === 'function') {
          const props = (overlayAny.getProperties as (id: string) => Record<string, unknown>)(overlay.id)
          baseColor = (props.lineColor ?? props.borderColor) as string | undefined
        }
        const pointColorOverride = baseColor != null ? { color: baseColor, activeColor: baseColor, borderColor: baseColor } : {}
        const pointStyles = { ...defaultStyles.point, ...pointColorOverride, ...styles?.point }
        const isTvMode = pointStyles.mode === 'stroke'
        // Get chart container background color for stroke-mode fill
        let bgColor = '#000000'
        if (isTvMode) {
          const container = this.getWidget().getPane().getChart().getContainer()
          const computed = window.getComputedStyle(container).backgroundColor
          if (computed !== '' && computed !== 'transparent' && computed !== 'rgba(0, 0, 0, 0)') {
            bgColor = computed
          }
        }
        // Extra handles are numbered on after the points, so the figure key,
        // the hover highlight and the drag path treat them exactly like a
        // point handle without knowing which is which.
        const extra = overlay.createExtraHandles?.({ overlay, coordinates }) ?? []
        const handles: OverlayExtraHandle[] = coordinates.map(({ x, y }) => ({ x, y })).concat(extra)
        handles.forEach(({ x, y, square }, index) => {
          // Skip points not in the allow-list (when `needDefaultPointFigure`
          // is a number[] whitelist). The extra handles are never listed, so
          // the allow-list only ever applies to the points.
          if (index < coordinates.length && allowedIndices !== null && !allowedIndices.has(index)) {
            return
          }
          let radius = pointStyles.radius
          let color = pointStyles.color
          let borderColor = pointStyles.borderColor
          let borderSize = pointStyles.borderSize
          if (hoverOverlayInfo.overlay?.id === overlay.id && hoverOverlayInfo.figureType === 'point' && hoverOverlayInfo.figure?.key === `${OVERLAY_FIGURE_KEY_PREFIX}point_${index}`) {
            radius = pointStyles.activeRadius
            color = pointStyles.activeColor
            borderColor = pointStyles.activeBorderColor
            borderSize = pointStyles.activeBorderSize
          }
          // A tool may want a resize arrow on one handle and a move cursor on
          // another; the figure's own `cursor` is what the hover path reads.
          const cursor = overlay.handleCursor?.({ overlay, coordinates, index })

          if (isTvMode && square === true) {
            // TV's edge handle: a rounded square the size of the ring.
            const half = Math.round(radius * 1.2)
            const attrs = { x: x - half, y: y - half, width: half * 2, height: half * 2 }
            this.createFigure({ name: 'rect', attrs, styles: { style: 'fill', color: bgColor, borderRadius: 2 } })?.draw(ctx)
            this.createFigure(
              {
                name: 'rect',
                attrs,
                styles: { style: 'stroke', color: 'transparent', borderColor, borderSize, borderRadius: 2, borderStyle: 'solid' }
              },
              this._createFigureEvents(overlay, 'point', index, {
                key: `${OVERLAY_FIGURE_KEY_PREFIX}point_${index}`,
                type: 'rect',
                attrs,
                styles: { borderColor },
                cursor
              }) ?? undefined
            )?.draw(ctx)
          } else if (isTvMode) {
            // TV-style: stroke circle with chart bg fill, 40% wider diameter (20% larger radius)
            const tvRadius = Math.round(radius * 1.2)
            // Draw filled background circle first, then stroke on top
            this.createFigure({
              name: 'circle',
              attrs: { x, y, r: tvRadius },
              styles: { color: bgColor }
            })?.draw(ctx)
            this.createFigure(
              {
                name: 'circle',
                attrs: { x, y, r: tvRadius },
                styles: {
                  style: 'stroke',
                  color: 'transparent',
                  borderColor,
                  borderSize,
                  borderStyle: 'solid'
                }
              },
              this._createFigureEvents(overlay, 'point', index, {
                key: `${OVERLAY_FIGURE_KEY_PREFIX}point_${index}`,
                type: 'circle',
                attrs: { x, y, r: tvRadius },
                styles: { borderColor },
                cursor
              }) ?? undefined
            )?.draw(ctx)
          } else {
            // Solid mode: two concentric filled circles (border + fill)
            this.createFigure(
              {
                name: 'circle',
                attrs: { x, y, r: radius + borderSize },
                styles: { color: borderColor }
              },
              this._createFigureEvents(overlay, 'point', index, {
                key: `${OVERLAY_FIGURE_KEY_PREFIX}point_${index}`,
                type: 'circle',
                attrs: { x, y, r: radius + borderSize },
                styles: { color: borderColor },
                cursor
              }) ?? undefined
            )?.draw(ctx)
            this.createFigure({
              name: 'circle',
              attrs: { x, y, r: radius },
              styles: { color }
            })?.draw(ctx)
          }
        })
      }
    }
  }
}
