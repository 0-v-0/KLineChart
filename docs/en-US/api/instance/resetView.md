---
outline: deep
---

# resetView()
`resetView` put the bar space and the right offset back to their defaults, returning to the view a fresh load shows.

## Reference {#reference}
<!--@include: @/@views/api/references/instance/resetView.md-->

### Parameters {#parameters}
`resetView` does not accept any parameters.

### Returns {#returns}
`resetView` returns a `Promise<void>` . Like `setVisibleRange`, a call made before the initial load finishes runs after it.

## Usage {#usage}
<script setup>
import ResetView from '../../../@views/api/samples/resetView/index.vue'
</script>

### Basic usage {#basic}
<ResetView/>
