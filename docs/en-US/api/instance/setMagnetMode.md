---
outline: deep
---

# setMagnetMode(mode)
`setMagnetMode` set how strongly the crosshair snaps to the bars.

## Reference {#reference}
<!--@include: @/@views/api/references/instance/setMagnetMode.md-->

### Parameters {#parameters}
- `mode` The snap strength: `normal`, `weak` or `strong`.
  - `normal` does not snap.
  - `weak` snaps the crosshair's x to the centre of the nearest bar.
  - `strong` also snaps its y to that bar's open, high, low or close.

### Returns {#returns}
`setMagnetMode` returns `undefined` .

## Usage {#usage}
<script setup>
import SetMagnetMode from '../../../@views/api/samples/setMagnetMode/index.vue'
</script>

### Basic usage {#basic}
<SetMagnetMode/>
