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

import type Chart from './Chart'
import Animation from './common/Animation'
import type Coordinate from './common/Coordinate'
import type Crosshair from './common/Crosshair'
import EventHandlerImp, { type EventHandler, type MouseTouchEvent, TOUCH_MIN_RADIUS } from './common/EventHandler'
import type Nullable from './common/Nullable'
import { UpdateLevel } from './common/Updater'
import { isAppleOS } from './common/utils/platform'
import { isArray, isFunction, isNumber, isString, isValid } from './common/utils/typeChecks'
import { yAxisWheelRangeFactor } from './common/utils/yAxisWheelZoom'

import type { AxisRange } from './component/Axis'
import type XAxis from './component/XAxis'
import type YAxisImp from './component/YAxis'
import { getHotkey, getSupportedHotkeys } from './extension/hotkey/index'
import type DrawPane from './pane/DrawPane'
import type Pane from './pane/Pane'
import { PaneIdConstants } from './pane/types'
import type XAxisPane from './pane/XAxisPane'
import { REAL_SEPARATOR_HEIGHT, WidgetNameConstants } from './widget/types'
import type Widget from './widget/Widget'
import type YAxisWidget from './widget/YAxisWidget'

interface EventTriggerWidgetInfo {
  pane: Nullable<Pane>
  widget: Nullable<Widget>
}

const FLING_DECAY = 0.975
const FLING_FRAME_DURATION = 1000 / 60
const FLING_MIN_FRAME_DISTANCE = 1

const hotkeyModifierAlias: Record<string, string> = {
  command: 'meta',
  cmd: 'meta',
  control: 'ctrl',
  option: 'alt',
  mod: isAppleOS() ? 'meta' : 'ctrl'
}

const hotkeyAlias: Record<string, string> = {
  '+': 'equal',
  plus: 'equal',
  add: 'equal',
  numpadadd: 'equal',
  '-': 'minus',
  subtract: 'minus',
  numpadsubtract: 'minus',
  esc: 'escape',
  del: 'delete',
  left: 'arrowleft',
  right: 'arrowright',
  up: 'arrowup',
  down: 'arrowdown'
}

const hotKeyModifierOrder = ['ctrl', 'alt', 'shift', 'meta']

export default class Event implements EventHandler {
  private readonly _chart: Chart
  private readonly _container: HTMLElement
  private readonly _event: EventHandlerImp

  // 惯性滚动开始时间
  private _flingStartTime = performance.now()
  // 惯性滚动动画
  private _flingScrollAnimation: Nullable<Animation> = null
  // 开始滚动时坐标点
  private _startScrollCoordinate: Nullable<Coordinate> = null
  // 开始触摸时坐标
  private _touchCoordinate: Nullable<Coordinate> = null
  // 是否是取消了十字光标
  private _touchCancelCrosshair = false
  // 是否缩放过
  private _touchZoomed = false
  // 用来记录捏合缩放的尺寸
  private _pinchScale = 1

  private _mouseDownWidget: Nullable<Widget> = null

  /** Where a Cmd/Ctrl press on empty space started a marquee, while one is dragged. */
  private _selectionStart: Nullable<{ paneId: string; x: number; y: number }> = null

  private readonly _prevYAxisRanges = new Map<YAxisImp, Nullable<AxisRange>>()

  private _xAxisStartScaleCoordinate: Nullable<Coordinate> = null
  private _xAxisStartScaleDistance = 0
  private _xAxisScale = 1

  private _yAxisStartScaleDistance = 0

  private _mouseMoveTriggerWidgetInfo: EventTriggerWidgetInfo = { pane: null, widget: null }

  // Defer single-click action so a following double-click can cancel it.
  private _pendingClickTimer: ReturnType<typeof setTimeout> | null = null

  // Dismisses the transient Shift+click measure, if one is on the chart.
  private _measureDismiss: Nullable<() => void> = null

  private readonly _boundKeyBoardDownEvent: (event: KeyboardEvent) => void = (event: KeyboardEvent) => {
    const target = event.target as Nullable<HTMLElement>
    const tagName = target?.tagName.toLowerCase()
    if (tagName === 'input' || tagName === 'textarea' || target?.isContentEditable === true) {
      return
    }
    const { enabled, exclude } = this._chart.getHotKey()
    if (!enabled) {
      return
    }
    const eventKeys: string[] = []
    if (event.ctrlKey) {
      eventKeys.push('ctrl')
    }
    if (event.altKey) {
      eventKeys.push('alt')
    }
    if (event.shiftKey) {
      eventKeys.push('shift')
    }
    if (event.metaKey) {
      eventKeys.push('meta')
    }
    const eventCode = event.code.trim().toLowerCase()
    if (/^key[a-z]$/.test(eventCode)) {
      eventKeys.push(eventCode.slice(3))
    } else if (/^digit[0-9]$/.test(eventCode)) {
      eventKeys.push(eventCode.slice(5))
    } else {
      eventKeys.push(hotkeyAlias[eventCode] ?? eventCode)
    }
    const key = eventKeys.join('+')
    const names = getSupportedHotkeys()
    for (let i = names.length - 1; i >= 0; i--) {
      const name = names[i]
      const hotkey = getHotkey(name)
      if (!exclude.includes(name) && isValid(hotkey)) {
        const hotkeyKeys = isArray<string>(hotkey.keys) ? hotkey.keys : [hotkey.keys]
        const match = hotkeyKeys.some((hotkeyKey) => {
          const modifiers: string[] = []
          let normalKey = ''
          hotkeyKey
            .replace(/\+\+$/, '+Plus')
            .replace(/\+=$/, '+Equal')
            .split('+')
            .forEach((part) => {
              const hotkeyPart = hotkeyModifierAlias[part.trim().toLowerCase()] ?? part
              const hotkeyPartValue = hotkeyPart.trim().toLowerCase()
              let value = ''
              if (/^key[a-z]$/.test(hotkeyPartValue)) {
                value = hotkeyPartValue.slice(3)
              } else if (/^digit[0-9]$/.test(hotkeyPartValue)) {
                value = hotkeyPartValue.slice(5)
              } else {
                value = hotkeyAlias[hotkeyPartValue] ?? hotkeyPartValue
              }
              if (hotKeyModifierOrder.includes(value)) {
                if (!modifiers.includes(value)) {
                  modifiers.push(value)
                }
              } else if (value.length > 0) {
                normalKey = value
              }
            })
          modifiers.sort((a, b) => hotKeyModifierOrder.indexOf(a) - hotKeyModifierOrder.indexOf(b))
          return [...modifiers, normalKey].filter((key) => key.length > 0).join('+') === key
        })
        if (match) {
          const params = { chart: this._chart, event, key, hotkey }
          if (!isFunction(hotkey.check) || hotkey.check(params)) {
            if (hotkey.preventDefault ?? true) {
              event.preventDefault()
            }
            if (hotkey.stopPropagation ?? false) {
              event.stopPropagation()
            }
            hotkey.action(params)
            return
          }
        }
      }
    }
  }

  // Touch drawing, the TradingView mobile way: while a tool is drawing, a
  // crosshair stands in for the finger. A drag anywhere moves it by the
  // finger's delta, like a trackpad, so the finger never covers the point,
  // and a tap places the point at the crosshair, not under the finger.
  // `_touchDrawPoint` is that crosshair, main-widget-local and unsnapped (the
  // overlay applies magnet itself); it is kept after a drawing ends so the
  // next one starts where this one left off. `_touchDraw` is the drag in
  // progress: where the finger and the crosshair were when it began.
  private _touchDrawPoint: Nullable<{ paneId: string; x: number; y: number }> = null
  private _touchDraw: Nullable<{ fingerX: number; fingerY: number; fromX: number; fromY: number }> = null
  // A drawing being placed by touch, and whether the crosshair has moved since
  // the last tap — what the host's step guide reads ("Move…" / "Tap…").
  private _touchDrawSession = false
  private _touchDrawMoved = false
  // Whether the last press anywhere on the page was a finger — the drawing
  // tool is picked outside the chart, so the chart's own events can't say.
  private _lastInputTouch = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches
  private readonly _onDocumentPointerDown = (e: PointerEvent): void => {
    this._lastInputTouch = e.pointerType === 'touch'
  }

  constructor(container: HTMLElement, chart: Chart) {
    this._chart = chart
    this._container = container
    this._event = new EventHandlerImp(container, this, {
      treatVertDragAsPageScroll: () => false,
      treatHorzDragAsPageScroll: () => false
    })
    document.addEventListener('keydown', this._boundKeyBoardDownEvent)
    document.addEventListener('pointerdown', this._onDocumentPointerDown, { capture: true, passive: true })
  }

  /** Called by the chart after `createOverlay`: a tool picked by touch shows its crosshair straight away. */
  overlayCreated(): void {
    if (!this._lastInputTouch || !this._isTouchDrawing()) {
      return
    }
    // TradingView starts from the crosshair already on the chart, if there is one.
    const crosshair = this._chart.getChartStore().getCrosshair()
    if (isString(crosshair.paneId) && isNumber(crosshair.x) && isNumber(crosshair.y)) {
      this._touchDrawPoint = { paneId: crosshair.paneId, x: crosshair.x, y: crosshair.y }
    }
    this._touchDrawSession = true
    this._touchDrawMoved = false
    this._showTouchDrawPoint(this._ensureTouchDrawPoint())
    this._emitTouchDrawing()
    this._chart.updatePane(UpdateLevel.Overlay)
  }

  /**
   * Tells the host where a touch drawing stands, for a step guide:
   * `{ id, placed, total, moved }` (`total` null for an open-ended path), or null
   * when it is over. `moved` — the crosshair moved since the last tap, so the
   * next step is a tap.
   */
  private _emitTouchDrawing(): void {
    const chartStore = this._chart.getChartStore()
    const info = chartStore.getProgressOverlayInfo()
    if (!this._touchDrawSession || info === null || !this._isTouchDrawing()) {
      this._touchDrawSession = false
      chartStore.executeAction('onTouchDrawingChange', null)
      return
    }
    const { overlay } = info
    chartStore.executeAction('onTouchDrawingChange', {
      id: overlay.id,
      placed: overlay.currentStep - 1,
      total: overlay.totalStep === Number.MAX_SAFE_INTEGER ? null : overlay.totalStep - 1,
      moved: this._touchDrawMoved
    })
  }

  /** The drawing in progress was removed (cancelled): its touch crosshair and step guide go too. */
  progressOverlayRemoved(): void {
    if (!this._touchDrawSession) {
      return
    }
    this._touchCoordinate = null
    this._touchDraw = null
    this._chart.getChartStore().setCrosshair(undefined, { notInvalidate: true })
    this._emitTouchDrawing()
  }

  /** Point-by-point drawing in progress. A freehand (continuous) tool still draws under the finger. */
  private _isTouchDrawing(): boolean {
    const info = this._chart.getChartStore().getProgressOverlayInfo()
    if (info === null) {
      return false
    }
    const { overlay } = info
    return overlay.isDrawing() && !overlay.isContinuousDrawing()
  }

  /** The touch crosshair, in the pane the drawing lives in — centred there when it has none yet. */
  private _ensureTouchDrawPoint(): { paneId: string; x: number; y: number } {
    const info = this._chart.getChartStore().getProgressOverlayInfo()
    // Before the first point the drawing can still go to any pane; after, it is fixed.
    const paneId = info !== null && !info.overlay.isStart() ? info.paneId : (this._touchDrawPoint?.paneId ?? info?.paneId ?? PaneIdConstants.CANDLE)
    const pane = this._chart.getDrawPaneById(paneId) ?? this._chart.getDrawPaneById(PaneIdConstants.CANDLE)
    const resolvedId = pane?.getId() ?? PaneIdConstants.CANDLE
    if (this._touchDrawPoint?.paneId !== resolvedId) {
      const bounding = pane?.getMainWidget().getBounding()
      this._touchDrawPoint = { paneId: resolvedId, x: (bounding?.width ?? 0) / 2, y: (bounding?.height ?? 0) / 2 }
    }
    return this._touchDrawPoint
  }

  private _touchDrawEvent(point: Coordinate, base?: MouseTouchEvent): MouseTouchEvent {
    return { pageX: base?.pageX ?? 0, pageY: base?.pageY ?? 0, ...(base ?? {}), x: point.x, y: point.y, isTouch: true }
  }

  /** Shows the crosshair at the touch point and previews the drawing there. */
  private _showTouchDrawPoint(point: { paneId: string; x: number; y: number }, base?: MouseTouchEvent): void {
    const chartStore = this._chart.getChartStore()
    // Marks touch-crosshair mode, so a later ordinary touch away from it clears it.
    this._touchCoordinate = { x: point.x, y: point.y }
    chartStore.setCrosshair({ x: point.x, y: point.y, paneId: point.paneId }, { notInvalidate: true })
    this._chart.getDrawPaneById(point.paneId)?.getMainWidget().dispatchEvent('mouseMoveEvent', this._touchDrawEvent(point, base))
  }

  /** A tap while drawing: commits the point at the crosshair (`mouseDoubleClickEvent` finishes a path). */
  private _placeTouchDrawPoint(name: 'mouseClickEvent' | 'mouseDoubleClickEvent', base: MouseTouchEvent): void {
    const point = this._ensureTouchDrawPoint()
    this._chart.getDrawPaneById(point.paneId)?.getMainWidget().dispatchEvent(name, this._touchDrawEvent(point, base))
    this._touchDrawMoved = false
    if (this._isTouchDrawing()) {
      // Next point, or a new drawing when the host keeps the tool armed.
      this._showTouchDrawPoint(this._ensureTouchDrawPoint(), base)
    } else {
      this._touchCoordinate = null
      this._chart.getChartStore().setCrosshair(undefined, { notInvalidate: true })
    }
    this._emitTouchDrawing()
    this._chart.updatePane(UpdateLevel.Overlay)
  }

  private _getYAxisByWidget(widget: Widget<DrawPane<YAxisImp>>): YAxisImp {
    if (widget.getName() === WidgetNameConstants.Y_AXIS) {
      return (widget as unknown as YAxisWidget).getAxisComponent() as unknown as YAxisImp
    }
    return widget.getPane().getYAxisComponentById() as unknown as YAxisImp
  }

  private _getYAxisScaleTargetByWidget(widget: Widget<DrawPane<YAxisImp>>): YAxisImp {
    const yAxis = this._getYAxisByWidget(widget)
    const pane = widget.getPane()
    if (pane.isManualYAxis(yAxis.id)) {
      return pane.getYAxisComponentById() as unknown as YAxisImp
    }
    return yAxis
  }

  private _syncYAxisValueRange(yAxis: YAxisImp, sourceRange: AxisRange): void {
    const baseRange = yAxis.getRange()
    const { from, to } = sourceRange
    const realFrom = yAxis.valueToRealValue(from, { range: baseRange })
    const realTo = yAxis.valueToRealValue(to, { range: baseRange })
    const displayFrom = yAxis.realValueToDisplayValue(realFrom, { range: baseRange })
    const displayTo = yAxis.realValueToDisplayValue(realTo, { range: baseRange })
    yAxis.setRange({
      from,
      to,
      range: to - from,
      realFrom,
      realTo,
      realRange: realTo - realFrom,
      displayFrom,
      displayTo,
      displayRange: displayTo - displayFrom
    })
  }

  private _syncManualYAxesValueRange(widget: Widget<DrawPane<YAxisImp>>, sourceYAxis: YAxisImp): void {
    const sourceRange = sourceYAxis.getRange()
    widget
      .getPane()
      .getYAxisComponents()
      .forEach((axis) => {
        const yAxis = axis as YAxisImp
        if (yAxis !== sourceYAxis && widget.getPane().isManualYAxis(yAxis.id)) {
          this._syncYAxisValueRange(yAxis, sourceRange)
        }
      })
  }

  private _resetYAxisAndManualYAxes(widget: Widget<DrawPane<YAxisImp>>, sourceYAxis: YAxisImp): void {
    sourceYAxis.setAutoCalcTickFlag(true)
    widget
      .getPane()
      .getYAxisComponents()
      .forEach((axis) => {
        const yAxis = axis as YAxisImp
        if (widget.getPane().isManualYAxis(yAxis.id)) {
          yAxis.setAutoCalcTickFlag(true)
        }
      })
    this._chart.layout({
      measureWidth: true,
      update: true,
      buildYAxisTick: true
    })
  }

  pinchStartEvent(): boolean {
    this._touchZoomed = true
    this._pinchScale = 1
    return true
  }

  pinchEvent(e: MouseTouchEvent, scale = 1): boolean {
    const { pane, widget } = this._findWidgetByEvent(e)
    if (pane?.getId() !== PaneIdConstants.X_AXIS && widget?.getName() === WidgetNameConstants.MAIN) {
      const event = this._makeWidgetEvent(e, widget)
      const zoomScale = (scale - this._pinchScale) * 5
      this._pinchScale = scale
      this._chart.getChartStore().zoom(zoomScale, { x: event.x, y: event.y }, 'main')
      return true
    }
    return false
  }

  mouseWheelHortEvent(e: MouseTouchEvent, distance = 0): boolean {
    // Sideways/Shift+wheel over the price axis must not scroll time; TradingView does nothing there.
    if (this._findWidgetByEvent(e).widget?.getName() === WidgetNameConstants.Y_AXIS) {
      return true
    }
    const store = this._chart.getChartStore()
    store.startScroll()
    store.scroll(distance)
    return true
  }

  mouseWheelVertEvent(e: MouseTouchEvent, scale = 1): boolean {
    const { widget } = this._findWidgetByEvent(e)
    const event = this._makeWidgetEvent(e, widget)
    const name = widget?.getName()
    if (name === WidgetNameConstants.MAIN) {
      // Cmd/Ctrl + wheel always zooms at the cursor, whatever anchor is configured.
      const atCursor = event.metaKey === true || event.ctrlKey === true
      this._chart.getChartStore().zoom(scale, { x: event.x, y: event.y }, 'main', atCursor)
      return true
    }
    if (name === WidgetNameConstants.X_AXIS && widget !== null) {
      // The wheel over the time axis zooms around the right edge; Cmd/Ctrl zooms
      // at the cursor instead, matching the main pane's behaviour.
      const atCursor = event.metaKey === true || event.ctrlKey === true
      const x = atCursor ? event.x : widget.getBounding().width
      this._chart.getChartStore().zoom(scale, { x }, 'xAxis', atCursor)
      return true
    }
    if (name === WidgetNameConstants.Y_AXIS) {
      const yAxisWidget = widget as Widget<DrawPane<YAxisImp>>
      const yAxis = this._getYAxisByWidget(yAxisWidget)
      if (yAxis.scrollZoomEnabled) {
        const scaleFactor = yAxisWheelRangeFactor(scale)
        const targetYAxis = this._getYAxisScaleTargetByWidget(yAxisWidget)
        this._zoomYAxis(targetYAxis, scaleFactor)
        this._syncManualYAxesValueRange(yAxisWidget, targetYAxis)
        return true
      }
    }
    return false
  }

  mouseDownEvent(e: MouseTouchEvent): boolean {
    const { pane, widget } = this._findWidgetByEvent(e)
    this._mouseDownWidget = widget
    if (widget !== null) {
      const event = this._makeWidgetEvent(e, widget)
      const name = widget.getName()
      switch (name) {
        case WidgetNameConstants.SEPARATOR: {
          return widget.dispatchEvent('mouseDownEvent', event)
        }
        case WidgetNameConstants.MAIN: {
          // Dispatch event first to allow overlays (e.g., continuous drawing) to consume it
          const consumed = widget.dispatchEvent('mouseDownEvent', event)
          // Cmd/Ctrl + press on empty chart space starts a marquee rather than a
          // pan. `consumed` is the test for "empty": a press that landed on a
          // drawing was consumed by it, and that gesture is a drag instead.
          if (!consumed && (event.metaKey === true || event.ctrlKey === true) && !this._chart.getChartStore().isOverlayDrawing()) {
            const paneId = pane?.getId() ?? ''
            this._selectionStart = { paneId, x: event.x, y: event.y }
            this._chart.getChartStore().setOverlaySelectionRect({ paneId, x1: event.x, y1: event.y, x2: event.x, y2: event.y })
            return true
          }
          // Only start scrolling if the event was not consumed by an overlay
          if (!consumed) {
            const yAxes = (pane as DrawPane<YAxisImp>).getYAxisComponents()
            for (const item of yAxes) {
              const yAxis = item as YAxisImp
              if (!yAxis.getAutoCalcTickFlag()) {
                const range = yAxis.getRange()
                this._prevYAxisRanges.set(yAxis, { ...range })
              }
            }
            this._startScrollCoordinate = { x: event.x, y: event.y }
            this._chart.getChartStore().startScroll()
          }
          return consumed
        }
        case WidgetNameConstants.X_AXIS: {
          return this._processXAxisScrollStartEvent(widget, event)
        }
        case WidgetNameConstants.Y_AXIS: {
          return this._processYAxisScaleStartEvent(widget as Widget<DrawPane<YAxisImp>>, event)
        }
      }
    }
    return false
  }

  mouseMoveEvent(e: MouseTouchEvent): boolean {
    const { pane, widget } = this._findWidgetByEvent(e)
    const event = this._makeWidgetEvent(e, widget)
    if (this._mouseMoveTriggerWidgetInfo.pane?.getId() !== pane?.getId() || this._mouseMoveTriggerWidgetInfo.widget?.getName() !== widget?.getName()) {
      widget?.dispatchEvent('mouseEnterEvent', event)
      this._mouseMoveTriggerWidgetInfo.widget?.dispatchEvent('mouseLeaveEvent', event)
      this._mouseMoveTriggerWidgetInfo = { pane, widget }
    }
    if (widget !== null) {
      const name = widget.getName()
      switch (name) {
        case WidgetNameConstants.MAIN: {
          const consumed = widget.dispatchEvent('mouseMoveEvent', event)
          let crosshair: Crosshair | undefined = { x: event.x, y: event.y, paneId: pane?.getId() }
          if (consumed) {
            if (widget.getForceCursor() !== 'pointer') {
              crosshair = undefined
            }
            widget.setCursor('pointer')
          } else {
            widget.setCursor('crosshair')
          }
          this._chart.getChartStore().setCrosshair(crosshair)
          return consumed
        }
        case WidgetNameConstants.SEPARATOR:
        case WidgetNameConstants.X_AXIS:
        case WidgetNameConstants.Y_AXIS: {
          const consumed = widget.dispatchEvent('mouseMoveEvent', event)
          this._chart.getChartStore().setCrosshair()
          return consumed
        }
      }
    }
    return false
  }

  pressedMouseMoveEvent(e: MouseTouchEvent): boolean {
    if (this._mouseDownWidget !== null && this._mouseDownWidget.getName() === WidgetNameConstants.SEPARATOR) {
      return this._mouseDownWidget.dispatchEvent('pressedMouseMoveEvent', e)
    }
    // An axis keeps its pressed drag until release, so dragging past the axis bounds
    // keeps scrolling or scaling instead of stopping (#794).
    const downWidget = this._mouseDownWidget
    if (downWidget !== null) {
      switch (downWidget.getName()) {
        case WidgetNameConstants.X_AXIS: {
          return this._processXAxisScrollingEvent(downWidget as Widget<DrawPane<XAxis>>, this._makeWidgetEvent(e, downWidget))
        }
        case WidgetNameConstants.Y_AXIS: {
          return this._processYAxisScalingEvent(downWidget as Widget<DrawPane<YAxisImp>>, this._makeWidgetEvent(e, downWidget))
        }
      }
    }
    const { pane, widget } = this._findWidgetByEvent(e)
    if (widget !== null && this._mouseDownWidget?.getPane().getId() === pane?.getId() && this._mouseDownWidget?.getName() === widget.getName()) {
      const event = this._makeWidgetEvent(e, widget)
      const name = widget.getName()
      switch (name) {
        case WidgetNameConstants.MAIN: {
          // Marquee in flight: grow the rect and swallow the move, so the chart
          // neither scrolls nor shows a crosshair mid-selection.
          const selectionStart = this._selectionStart
          if (selectionStart !== null) {
            this._chart.getChartStore().setOverlaySelectionRect({ paneId: selectionStart.paneId, x1: selectionStart.x, y1: selectionStart.y, x2: event.x, y2: event.y })
            return true
          }
          // eslint-disable-next-line @typescript-eslint/init-declarations -- ignore
          let crosshair: Crosshair | undefined
          widget.setPinnedCrosshair(null)
          const consumed = widget.dispatchEvent('pressedMouseMoveEvent', event)
          const pinned = widget.getPinnedCrosshair()
          if (!consumed) {
            this._processMainScrollingEvent(widget as Widget<DrawPane<YAxisImp>>, event)
          } else {
            // Explicitly update overlay when event was consumed (e.g., continuous drawing)
            this._chart.updatePane(UpdateLevel.Overlay)
          }
          if (consumed && pinned !== null) {
            // A drag that knows where its line landed (a snapped point, a
            // price-stepped order) keeps the crosshair on it, whatever the
            // pointer is doing.
            crosshair = { x: pinned.x ?? event.x, y: pinned.y ?? event.y, paneId: pane?.getId() }
          } else if (!consumed || widget.getForceCursor() === 'pointer') {
            crosshair = { x: event.x, y: event.y, paneId: pane?.getId() }
          }
          this._chart.getChartStore().setCrosshair(crosshair, { forceInvalidate: true })
          return consumed
        }
      }
    }
    return false
  }

  mouseUpEvent(e: MouseTouchEvent): boolean {
    // Close a marquee before anything else: commit whatever it swept up and drop
    // the rect. It adds to the existing selection, so several sweeps (and
    // Cmd-clicks) accumulate the way they do in TradingView.
    if (this._selectionStart !== null) {
      const store = this._chart.getChartStore()
      const rect = store.getOverlaySelectionRect()
      if (rect !== null && (Math.abs(rect.x2 - rect.x1) > 1 || Math.abs(rect.y2 - rect.y1) > 1)) {
        const swept = store.selectOverlaysByRect(rect)
        store.setSelectedOverlayIds([...new Set([...store.getSelectedOverlayIds(), ...swept])])
      }
      store.setOverlaySelectionRect(null)
      this._selectionStart = null
      this._mouseDownWidget = null
      this._startScrollCoordinate = null
      return true
    }
    const widget = this._mouseDownWidget ?? this._findWidgetByEvent(e).widget
    let consumed = false
    if (widget !== null) {
      const event = this._makeWidgetEvent(e, widget)
      const name = widget.getName()
      switch (name) {
        case WidgetNameConstants.MAIN:
        case WidgetNameConstants.SEPARATOR:
        case WidgetNameConstants.X_AXIS:
        case WidgetNameConstants.Y_AXIS: {
          consumed = widget.dispatchEvent('mouseUpEvent', event)
          break
        }
      }
      if (consumed) {
        this._chart.updatePane(UpdateLevel.Overlay)
      }
    }
    this._mouseDownWidget = null
    this._startScrollCoordinate = null
    this._prevYAxisRanges.clear()
    this._xAxisStartScaleCoordinate = null
    this._xAxisStartScaleDistance = 0
    this._xAxisScale = 1
    this._yAxisStartScaleDistance = 0
    return consumed
  }

  mouseClickEvent(e: MouseTouchEvent): boolean {
    const { pane, widget } = this._findWidgetByEvent(e)
    if (widget !== null) {
      const event = this._makeWidgetEvent(e, widget)
      const consumed = widget.dispatchEvent('mouseClickEvent', event)
      // Fire onChartClick only when no overlay consumed the click
      const widgetName = widget.getName()
      if (!consumed && event.shiftKey === true && pane?.getId() === PaneIdConstants.CANDLE && widgetName === WidgetNameConstants.MAIN && !this._chart.getChartStore().isOverlayDrawing()) {
        this._startQuickMeasure(widget, event)
        return true
      }
      if (!consumed && pane !== null && widgetName === WidgetNameConstants.MAIN) {
        const chartStore = this._chart.getChartStore()
        if (chartStore.hasAction('onChartClick')) {
          const crosshair = chartStore.getCrosshair()
          const payload = { x: event.x, y: event.y, pageX: event.pageX, pageY: event.pageY, ...crosshair }
          // Defer so a following double-click can cancel it
          if (this._pendingClickTimer !== null) {
            clearTimeout(this._pendingClickTimer)
          }
          this._pendingClickTimer = setTimeout(() => {
            this._pendingClickTimer = null
            chartStore.executeAction('onChartClick', payload)
          }, 250)
        }
      }
      return consumed
    }
    return false
  }

  mouseRightClickEvent(e: MouseTouchEvent): boolean {
    const { pane, widget } = this._findWidgetByEvent(e)
    let consumed = false
    if (widget !== null) {
      const event = this._makeWidgetEvent(e, widget)
      const name = widget.getName()
      switch (name) {
        case WidgetNameConstants.MAIN:
        case WidgetNameConstants.X_AXIS:
        case WidgetNameConstants.Y_AXIS: {
          consumed = widget.dispatchEvent('mouseRightClickEvent', event)
          break
        }
      }
      // Fire onChartRightClick only when no overlay consumed the right-click
      if (!consumed && pane !== null && name === WidgetNameConstants.MAIN) {
        const chartStore = this._chart.getChartStore()
        if (chartStore.hasAction('onChartRightClick')) {
          const crosshair = chartStore.getCrosshair()
          chartStore.executeAction('onChartRightClick', {
            x: event.x,
            y: event.y,
            pageX: event.pageX,
            pageY: event.pageY,
            ...crosshair
          })
        }
      }
      if (consumed) {
        this._chart.updatePane(UpdateLevel.Overlay)
      }
    }
    return false
  }

  mouseMiddleClickEvent(e: MouseTouchEvent): boolean {
    const { widget } = this._findWidgetByEvent(e)
    if (widget?.getName() === WidgetNameConstants.MAIN) {
      const consumed = widget.dispatchEvent('mouseMiddleClickEvent', this._makeWidgetEvent(e, widget))
      if (consumed) {
        this._chart.updatePane(UpdateLevel.Overlay)
      }
      return consumed
    }
    return false
  }

  mouseDoubleClickEvent(e: MouseTouchEvent): boolean {
    const { widget, pane } = this._findWidgetByEvent(e)
    if (widget !== null) {
      const name = widget.getName()
      switch (name) {
        case WidgetNameConstants.MAIN: {
          const event = this._makeWidgetEvent(e, widget)
          // Cancel any pending single-click dispatch — this is a double-click
          if (this._pendingClickTimer !== null) {
            clearTimeout(this._pendingClickTimer)
            this._pendingClickTimer = null
          }
          const consumed = widget.dispatchEvent('mouseDoubleClickEvent', event)
          // Fire onChartDoubleClick only when no overlay consumed the double-click
          if (!consumed && pane !== null) {
            const chartStore = this._chart.getChartStore()
            if (chartStore.hasAction('onChartDoubleClick')) {
              const crosshair = chartStore.getCrosshair()
              chartStore.executeAction('onChartDoubleClick', {
                x: event.x,
                y: event.y,
                pageX: event.pageX,
                pageY: event.pageY,
                ...crosshair
              })
            }
          }
          return consumed
        }
        case WidgetNameConstants.Y_AXIS: {
          const yAxisWidget = widget as Widget<DrawPane<YAxisImp>>
          const yAxis = this._getYAxisByWidget(yAxisWidget)
          const targetYAxis = this._getYAxisScaleTargetByWidget(yAxisWidget)
          if (!targetYAxis.getAutoCalcTickFlag() || !yAxis.getAutoCalcTickFlag()) {
            this._resetYAxisAndManualYAxes(yAxisWidget, targetYAxis)
            return true
          }
          break
        }
      }
    }
    return false
  }

  mouseLeaveEvent(e: MouseTouchEvent): boolean {
    const widget = this._mouseMoveTriggerWidgetInfo.widget
    if (widget !== null) {
      widget.dispatchEvent('mouseLeaveEvent', this._makeWidgetEvent(e, widget))
      this._mouseMoveTriggerWidgetInfo = { pane: null, widget: null }
    }
    this._chart.getChartStore().setCrosshair()
    return true
  }

  touchStartEvent(e: MouseTouchEvent): boolean {
    const { pane, widget } = this._findWidgetByEvent(e)
    if (widget !== null) {
      const event = this._makeWidgetEvent(e, widget)
      event.preventDefault?.()
      const name = widget.getName()
      switch (name) {
        case WidgetNameConstants.MAIN: {
          const chartStore = this._chart.getChartStore()
          if (this._isTouchDrawing()) {
            this.stopFlingScroll()
            const point = this._ensureTouchDrawPoint()
            this._touchDraw = { fingerX: event.x, fingerY: event.y, fromX: point.x, fromY: point.y }
            if (!this._touchDrawSession) {
              this._touchDrawSession = true
              this._emitTouchDrawing()
            }
            this._showTouchDrawPoint(point, event)
            this._chart.updatePane(UpdateLevel.Overlay)
            return true
          }
          if (widget.dispatchEvent('mouseDownEvent', event)) {
            this._touchCancelCrosshair = true
            this._touchCoordinate = null
            chartStore.setCrosshair(undefined, { notInvalidate: true })
            this._chart.updatePane(UpdateLevel.Overlay)
            return true
          }
          this.stopFlingScroll()
          this._flingStartTime = performance.now()

          const yAxes = (pane as DrawPane<YAxisImp>).getYAxisComponents()

          for (const item of yAxes) {
            const yAxis = item as YAxisImp
            if (!yAxis.getAutoCalcTickFlag()) {
              const range = yAxis.getRange()
              this._prevYAxisRanges.set(yAxis, { ...range })
            }
          }

          this._startScrollCoordinate = { x: event.x, y: event.y }
          chartStore.startScroll()
          this._touchZoomed = false
          if (this._touchCoordinate !== null) {
            // Where the crosshair is now: a drag or a zoom since it was set moved it.
            const crosshair = chartStore.getCrosshair()
            const at = isNumber(crosshair.x) && isNumber(crosshair.y) ? { x: crosshair.x, y: crosshair.y } : this._touchCoordinate
            const xDif = event.x - at.x
            const yDif = event.y - at.y
            const radius = Math.sqrt(xDif * xDif + yDif * yDif)
            if (radius < TOUCH_MIN_RADIUS) {
              this._touchCoordinate = { x: event.x, y: event.y }
              chartStore.setAnchoredCrosshair({ x: event.x, y: event.y, paneId: pane?.getId() })
            } else {
              this._touchCoordinate = null
              this._touchCancelCrosshair = true
              chartStore.setCrosshair()
            }
          }
          return true
        }
        case WidgetNameConstants.X_AXIS: {
          return this._processXAxisScrollStartEvent(widget, event)
        }
        case WidgetNameConstants.Y_AXIS: {
          return this._processYAxisScaleStartEvent(widget as Widget<DrawPane<YAxisImp>>, event)
        }
      }
    }
    return false
  }

  touchMoveEvent(e: MouseTouchEvent): boolean {
    const touchDraw = this._touchDraw
    if (touchDraw !== null) {
      e.preventDefault?.()
      const point = this._ensureTouchDrawPoint()
      const bounding = this._chart.getDrawPaneById(point.paneId)?.getMainWidget().getBounding()
      const clamp = (v: number, max: number): number => Math.min(Math.max(v, 0), max)
      point.x = clamp(touchDraw.fromX + e.x - touchDraw.fingerX, bounding?.width ?? 0)
      point.y = clamp(touchDraw.fromY + e.y - touchDraw.fingerY, bounding?.height ?? 0)
      this._showTouchDrawPoint(point, e)
      if (!this._touchDrawMoved) {
        this._touchDrawMoved = true
        this._emitTouchDrawing()
      }
      this._chart.updatePane(UpdateLevel.Overlay)
      return true
    }
    const { pane, widget } = this._findWidgetByEvent(e)
    if (widget !== null) {
      const event = this._makeWidgetEvent(e, widget)
      const name = widget.getName()
      const chartStore = this._chart.getChartStore()
      switch (name) {
        case WidgetNameConstants.MAIN: {
          if (widget.dispatchEvent('pressedMouseMoveEvent', event)) {
            event.preventDefault?.()
            chartStore.setCrosshair(undefined, { notInvalidate: true })
            this._chart.updatePane(UpdateLevel.Overlay)
            return true
          }
          if (this._touchCoordinate !== null) {
            event.preventDefault?.()
            chartStore.setAnchoredCrosshair({ x: event.x, y: event.y, paneId: pane?.getId() })
          } else {
            this._processMainScrollingEvent(widget as Widget<DrawPane<YAxisImp>>, event)
          }
          return true
        }
        case WidgetNameConstants.X_AXIS: {
          event.preventDefault?.()
          return this._processXAxisScrollingEvent(widget as Widget<DrawPane<XAxis>>, event)
        }
        case WidgetNameConstants.Y_AXIS: {
          return this._processYAxisScalingEvent(widget as Widget<DrawPane<YAxisImp>>, event)
        }
      }
    }
    return false
  }

  touchEndEvent(e: MouseTouchEvent): boolean {
    if (this._touchDraw !== null) {
      // Lifting only ends the move; the tap that follows a still touch places the point.
      this._touchDraw = null
      return true
    }
    const { widget } = this._findWidgetByEvent(e)
    if (widget !== null) {
      const event = this._makeWidgetEvent(e, widget)
      const name = widget.getName()
      switch (name) {
        case WidgetNameConstants.MAIN: {
          widget.dispatchEvent('mouseUpEvent', event)
          if (this._startScrollCoordinate !== null) {
            const time = performance.now() - this._flingStartTime
            const distance = event.x - this._startScrollCoordinate.x
            const initialFrameDistance = (distance / (time > 0 ? time : 1)) * 20
            if (time < 200 && Math.abs(initialFrameDistance) > FLING_MIN_FRAME_DISTANCE) {
              const store = this._chart.getChartStore()
              const duration = (Math.log(FLING_MIN_FRAME_DISTANCE / Math.abs(initialFrameDistance)) / Math.log(FLING_DECAY)) * FLING_FRAME_DURATION
              const animation = new Animation({ duration }).doFrame((frameTime) => {
                const frameCount = frameTime / FLING_FRAME_DURATION
                const progressDistance = (initialFrameDistance * (1 - FLING_DECAY ** frameCount)) / (1 - FLING_DECAY)
                store.scroll(progressDistance)
                if (frameTime >= duration && this._flingScrollAnimation === animation) {
                  this._flingScrollAnimation = null
                }
              })
              store.startScroll()
              this._flingScrollAnimation = animation
              animation.start()
            }
          }
          return true
        }
        case WidgetNameConstants.X_AXIS:
        case WidgetNameConstants.Y_AXIS: {
          const consumed = widget.dispatchEvent('mouseUpEvent', event)
          if (consumed) {
            this._chart.updatePane(UpdateLevel.Overlay)
          }
        }
      }
      this._startScrollCoordinate = null
      this._prevYAxisRanges.clear()
      this._xAxisStartScaleCoordinate = null
      this._xAxisStartScaleDistance = 0
      this._xAxisScale = 1
      this._yAxisStartScaleDistance = 0
    }
    return false
  }

  touchCancelEvent(e: MouseTouchEvent): boolean {
    const { widget } = this._findWidgetByEvent(e)
    if (widget !== null) {
      const event = this._makeWidgetEvent(e, widget)
      // notify the widget the gesture is over, same as a touch end
      widget.dispatchEvent('mouseUpEvent', event)
    }
    this._startScrollCoordinate = null
    this._prevYAxisRanges.clear()
    this._xAxisStartScaleCoordinate = null
    this._xAxisStartScaleDistance = 0
    this._xAxisScale = 1
    this._yAxisStartScaleDistance = 0
    this._touchCoordinate = null
    this._touchCancelCrosshair = false
    this._touchZoomed = false
    this._chart.getChartStore().setCrosshair()
    return true
  }

  tapEvent(e: MouseTouchEvent): boolean {
    if (this._isTouchDrawing()) {
      this._placeTouchDrawPoint('mouseClickEvent', e)
      return true
    }
    const { pane, widget } = this._findWidgetByEvent(e)
    let consumed = false
    if (widget !== null) {
      const event = this._makeWidgetEvent(e, widget)
      const result = widget.dispatchEvent('mouseClickEvent', event)
      if (widget.getName() === WidgetNameConstants.MAIN) {
        const event = this._makeWidgetEvent(e, widget)
        const chartStore = this._chart.getChartStore()
        if (result) {
          this._touchCancelCrosshair = true
          this._touchCoordinate = null
          chartStore.setCrosshair(undefined, { notInvalidate: true })
          consumed = true
        } else {
          if (!this._touchCancelCrosshair && !this._touchZoomed) {
            this._touchCoordinate = { x: event.x, y: event.y }
            chartStore.setAnchoredCrosshair({ x: event.x, y: event.y, paneId: pane?.getId() }, { notInvalidate: true })
            consumed = true
          }
          this._touchCancelCrosshair = false

          // Fire onChartClick when no overlay consumed — matches mouseClickEvent
          // so Superchart's onSelect callback works on touch. Deferred 250ms
          // so a following double-tap can cancel it via mouseDoubleClickEvent.
          if (pane !== null && chartStore.hasAction('onChartClick')) {
            const crosshair = chartStore.getCrosshair()
            const payload = {
              x: event.x,
              y: event.y,
              pageX: event.pageX,
              pageY: event.pageY,
              ...crosshair
            }
            if (this._pendingClickTimer !== null) {
              clearTimeout(this._pendingClickTimer)
            }
            this._pendingClickTimer = setTimeout(() => {
              this._pendingClickTimer = null
              chartStore.executeAction('onChartClick', payload)
            }, 250)
          }
        }
      }
      if (consumed || result) {
        this._chart.updatePane(UpdateLevel.Overlay)
      }
    }
    return consumed
  }

  doubleTapEvent(e: MouseTouchEvent): boolean {
    if (this._isTouchDrawing()) {
      // Two quick taps are two points — except on an open-ended path, where
      // (as with a double-click) the second one finishes it.
      const overlay = this._chart.getChartStore().getProgressOverlayInfo()?.overlay
      this._placeTouchDrawPoint(overlay?.totalStep === Number.MAX_SAFE_INTEGER ? 'mouseDoubleClickEvent' : 'mouseClickEvent', e)
      return true
    }
    return this.mouseDoubleClickEvent(e)
  }

  longTapEvent(e: MouseTouchEvent): boolean {
    // Holding still before a careful drag must not open the context menu (and cancel the drawing).
    if (isValid(this._touchDraw)) {
      return true
    }
    const { pane, widget } = this._findWidgetByEvent(e)
    if (widget !== null && widget.getName() === WidgetNameConstants.MAIN) {
      const event = this._makeWidgetEvent(e, widget)
      this._touchCoordinate = { x: event.x, y: event.y }
      this._chart.getChartStore().setAnchoredCrosshair({ x: event.x, y: event.y, paneId: pane?.getId() })

      // Dispatch right-click semantics so overlays' onRightClick handlers fire
      // (e.g. show OverlayOptionsPopup) on mobile/touch long-press.
      const consumed = widget.dispatchEvent('mouseRightClickEvent', event)

      // Fire onChartRightClick only when no overlay consumed the long-press —
      // matches mouseRightClickEvent so Superchart's onRightSelect callback
      // and chart background context menu work on touch.
      if (!consumed && pane !== null) {
        const chartStore = this._chart.getChartStore()
        if (chartStore.hasAction('onChartRightClick')) {
          const crosshair = chartStore.getCrosshair()
          chartStore.executeAction('onChartRightClick', {
            x: event.x,
            y: event.y,
            pageX: event.pageX,
            pageY: event.pageY,
            ...crosshair
          })
        }
      }

      if (consumed) {
        this._chart.updatePane(UpdateLevel.Overlay)
      }
      return true
    }
    return false
  }

  private _processMainScrollingEvent(widget: Widget<DrawPane<YAxisImp>>, event: MouseTouchEvent): void {
    if (this._startScrollCoordinate !== null) {
      const yAxes = widget.getPane().getYAxisComponents()
      for (const item of yAxes) {
        const yAxis = item as YAxisImp
        const prevRange = this._prevYAxisRanges.get(yAxis)
        if (isValid(prevRange) && !yAxis.getAutoCalcTickFlag() && yAxis.scrollZoomEnabled) {
          event.preventDefault?.()
          const { from, to, range } = prevRange
          let distance = 0
          if (yAxis.reverse) {
            distance = this._startScrollCoordinate.y - event.y
          } else {
            distance = event.y - this._startScrollCoordinate.y
          }
          const bounding = widget.getBounding()
          const scale = distance / bounding.height
          const difRange = range * scale
          const newFrom = from + difRange
          const newTo = to + difRange
          const newRealFrom = yAxis.valueToRealValue(newFrom, { range: prevRange })
          const newRealTo = yAxis.valueToRealValue(newTo, { range: prevRange })
          const newDisplayFrom = yAxis.realValueToDisplayValue(newRealFrom, { range: prevRange })
          const newDisplayTo = yAxis.realValueToDisplayValue(newRealTo, { range: prevRange })
          yAxis.setRange({
            from: newFrom,
            to: newTo,
            range: newTo - newFrom,
            realFrom: newRealFrom,
            realTo: newRealTo,
            realRange: newRealTo - newRealFrom,
            displayFrom: newDisplayFrom,
            displayTo: newDisplayTo,
            displayRange: newDisplayTo - newDisplayFrom
          })
        }
      }

      const distance = event.x - this._startScrollCoordinate.x
      this._chart.getChartStore().scroll(distance)
    }
  }

  private _processXAxisScrollStartEvent(widget: Widget, event: MouseTouchEvent): boolean {
    const consumed = widget.dispatchEvent('mouseDownEvent', event)
    if (consumed) {
      this._chart.updatePane(UpdateLevel.Overlay)
    }
    this._xAxisStartScaleCoordinate = { x: event.x, y: event.y }
    this._xAxisStartScaleDistance = event.pageX
    return consumed
  }

  private _processXAxisScrollingEvent(widget: Widget<DrawPane<XAxis>>, event: MouseTouchEvent): boolean {
    const consumed = widget.dispatchEvent('pressedMouseMoveEvent', event)
    if (!consumed) {
      const xAxis = (widget.getPane() as unknown as XAxisPane).getXAxisComponent()
      if (xAxis.scrollZoomEnabled && this._xAxisStartScaleDistance !== 0) {
        const scale = this._xAxisStartScaleDistance / event.pageX
        if (Number.isFinite(scale)) {
          const zoomScale = (scale - this._xAxisScale) * 10
          this._xAxisScale = scale
          this._chart.getChartStore().zoom(zoomScale, this._xAxisStartScaleCoordinate, 'xAxis')
        }
      }
    } else {
      this._chart.updatePane(UpdateLevel.Overlay)
    }
    return consumed
  }

  private _processYAxisScaleStartEvent(widget: Widget<DrawPane<YAxisImp>>, event: MouseTouchEvent): boolean {
    const consumed = widget.dispatchEvent('mouseDownEvent', event)
    if (consumed) {
      this._chart.updatePane(UpdateLevel.Overlay)
    }
    const yAxis = this._getYAxisScaleTargetByWidget(widget)
    const range = yAxis.getRange()
    this._prevYAxisRanges.set(yAxis, { ...range })
    this._yAxisStartScaleDistance = event.pageY
    return consumed
  }

  private _processYAxisScalingEvent(widget: Widget<DrawPane<YAxisImp>>, event: MouseTouchEvent): boolean {
    const consumed = widget.dispatchEvent('pressedMouseMoveEvent', event)
    if (!consumed) {
      const yAxis = this._getYAxisByWidget(widget)
      const targetYAxis = this._getYAxisScaleTargetByWidget(widget)
      const prevYAxisRange = this._prevYAxisRanges.get(targetYAxis)
      if (isValid(prevYAxisRange) && yAxis.scrollZoomEnabled && this._yAxisStartScaleDistance !== 0) {
        event.preventDefault?.()
        const scaleFactor = event.pageY / this._yAxisStartScaleDistance
        this._zoomYAxis(targetYAxis, scaleFactor, prevYAxisRange)
        this._syncManualYAxesValueRange(widget, targetYAxis)
      }
    } else {
      this._chart.updatePane(UpdateLevel.Overlay)
    }
    return consumed
  }

  private _zoomYAxis(yAxis: YAxisImp, scaleFactor: number, baseRange?: AxisRange): void {
    const prevYAxisRange = baseRange ?? yAxis.getRange()
    const { from, to, range } = prevYAxisRange
    const newRange = range * scaleFactor
    const difRange = (newRange - range) / 2
    const newFrom = from - difRange
    const newTo = to + difRange
    const newRealFrom = yAxis.valueToRealValue(newFrom, { range: prevYAxisRange })
    const newRealTo = yAxis.valueToRealValue(newTo, { range: prevYAxisRange })
    const newDisplayFrom = yAxis.realValueToDisplayValue(newRealFrom, { range: prevYAxisRange })
    const newDisplayTo = yAxis.realValueToDisplayValue(newRealTo, { range: prevYAxisRange })
    yAxis.setRange({
      from: newFrom,
      to: newTo,
      range: newRange,
      realFrom: newRealFrom,
      realTo: newRealTo,
      realRange: newRealTo - newRealFrom,
      displayFrom: newDisplayFrom,
      displayTo: newDisplayTo,
      displayRange: newDisplayTo - newDisplayFrom
    })
    this._chart.layout({
      measureWidth: true,
      update: true,
      buildYAxisTick: true
    })
  }

  // TradingView's Shift+click measure: the click places the first point, the
  // next click finishes it, the click after that dismisses it. Engine-owned and
  // never persisted, so the host needs no wiring.
  private _startQuickMeasure(widget: Widget, event: MouseTouchEvent): void {
    this._measureDismiss?.()
    const id = this._chart.createOverlay({
      name: 'measure',
      paneId: PaneIdConstants.CANDLE,
      onDrawEnd: ({ overlay }) => {
        // Deferred so the click that finished the measure doesn't dismiss it.
        setTimeout(() => {
          const dismiss = (): void => {
            this._measureDismiss?.()
            this._chart.removeOverlay({ id: overlay.id })
          }
          this._measureDismiss = () => {
            this._container.removeEventListener('mousedown', dismiss, true)
            this._measureDismiss = null
          }
          this._container.addEventListener('mousedown', dismiss, true)
        }, 0)
      }
    })
    if (id === null) {
      return
    }
    widget.dispatchEvent('mouseClickEvent', event)
    this._chart.updatePane(UpdateLevel.Overlay)
  }

  private _findWidgetByEvent(event: MouseTouchEvent): EventTriggerWidgetInfo {
    const { x, y } = event
    const separatorPanes = this._chart.getSeparatorPanes()
    const separatorSize = this._chart.getStyles().separator.size
    for (const items of separatorPanes) {
      const pane = items[1]
      const bounding = pane.getBounding()
      const top = bounding.top - Math.round((REAL_SEPARATOR_HEIGHT - separatorSize) / 2)
      if (x >= bounding.left && x <= bounding.left + bounding.width && y >= top && y <= top + REAL_SEPARATOR_HEIGHT) {
        return { pane, widget: pane.getWidget() }
      }
    }

    const drawPanes = this._chart.getDrawPanes()

    let pane: Nullable<DrawPane> = null
    for (const p of drawPanes) {
      const bounding = p.getBounding()
      if (x >= bounding.left && x <= bounding.left + bounding.width && y >= bounding.top && y <= bounding.top + bounding.height) {
        pane = p
        break
      }
    }
    let widget: Nullable<Widget> = null
    if (pane !== null) {
      if (!isValid(widget)) {
        const mainWidget = pane.getMainWidget()
        const mainBounding = mainWidget.getBounding()
        if (x >= mainBounding.left && x <= mainBounding.left + mainBounding.width && y >= mainBounding.top && y <= mainBounding.top + mainBounding.height) {
          widget = mainWidget
        }
      }
      if (!isValid(widget)) {
        for (const yAxisWidget of pane.getYAxisWidgets()) {
          const yAxisBounding = yAxisWidget.getBounding()
          if (x >= yAxisBounding.left && x <= yAxisBounding.left + yAxisBounding.width && y >= yAxisBounding.top && y <= yAxisBounding.top + yAxisBounding.height) {
            widget = yAxisWidget
            break
          }
        }
      }
    }
    return { pane, widget }
  }

  private _makeWidgetEvent(event: MouseTouchEvent, widget: Nullable<Widget>): MouseTouchEvent {
    const bounding = widget?.getBounding() ?? null
    return {
      ...event,
      x: event.x - (bounding?.left ?? 0),
      y: event.y - (bounding?.top ?? 0)
    }
  }

  stopFlingScroll(): void {
    this._flingScrollAnimation?.cancel()
    this._flingScrollAnimation = null
  }

  destroy(): void {
    this.stopFlingScroll()
    document.removeEventListener('keydown', this._boundKeyBoardDownEvent)
    document.removeEventListener('pointerdown', this._onDocumentPointerDown, { capture: true })
    this._event.destroy()
  }
}
