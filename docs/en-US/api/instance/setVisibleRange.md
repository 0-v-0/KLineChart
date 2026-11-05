---
outline: deep
---

# setVisibleRange(range)
`setVisibleRange` show the range between two timestamps, loading the data before it first.

## Reference {#reference}
<!--@include: @/@views/api/references/instance/setVisibleRange.md-->

### Parameters {#parameters}
- `range` The range.
  - `from` The start timestamp in milliseconds.
  - `to` The end timestamp in milliseconds.

### Returns {#returns}
`setVisibleRange` returns a `Promise<void>` . Called before the initial load finishes it runs after it; a call made meanwhile replaces the previous one.

## Usage {#usage}
<script setup>
import SetVisibleRange from '../../../@views/api/samples/setVisibleRange/index.vue'
</script>

### Basic usage {#basic}
<SetVisibleRange/>
