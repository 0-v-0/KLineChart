---
outline: deep
---

# setZoomAnchor(anchor)
`setZoomAnchor` set zoom anchor point for main and xAxis panes.

## Reference {#reference}
<!--@include: @/@views/api/references/instance/setZoomAnchor.md-->

### Parameters {#parameters}
- `anchor: ZoomAnchor` zoom anchor point type for main and xAxis pane: `cursor`, `last_bar`, `right_edge`, or an object `{ main, xAxis }`.
  - `cursor` anchors at the pointer, so what is under it stays put.
  - `last_bar` anchors at the last bar.
  - `right_edge` anchors at the right edge: the bar sitting there stays there, and the gap after the last bar scales with the rest.

### Returns {#returns}
`setZoomAnchor` returns `undefined` .

## Usage {#usage}
<script setup>
import SetZoomAnchor from '../../../@views/api/samples/setZoomAnchor/index.vue'
</script>

### Basic usage {#basic}
<SetZoomAnchor/>