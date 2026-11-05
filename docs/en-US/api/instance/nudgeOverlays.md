---
outline: deep
---

# nudgeOverlays(ids, direction)
`nudgeOverlays` move overlays one pixel in a direction, for keyboard nudging.

## Reference {#reference}
<!--@include: @/@views/api/references/instance/nudgeOverlays.md-->

### Parameters {#parameters}
- `ids` The overlay ids.
  - `direction` One of `left`, `right`, `up` or `down`.

### Returns {#returns}
`nudgeOverlays` returns a `boolean` , whether anything moved.

## Usage {#usage}
<script setup>
import NudgeOverlays from '../../../@views/api/samples/nudgeOverlays/index.vue'
</script>

### Basic usage {#basic}
<NudgeOverlays/>
