---
outline: deep
---

# getVisibleRangeTimestamps()
`getVisibleRangeTimestamps` get the timestamps at both ends of the visible range, or `null` when there is no data.

## Reference {#reference}
<!--@include: @/@views/api/references/instance/getVisibleRangeTimestamps.md-->

### Parameters {#parameters}
`getVisibleRangeTimestamps` does not accept any parameters.

### Returns {#returns}
`getVisibleRangeTimestamps` returns `{ from, to }` in milliseconds, or `null` .

## Usage {#usage}
<script setup>
import GetVisibleRangeTimestamps from '../../../@views/api/samples/getVisibleRangeTimestamps/index.vue'
</script>

### Basic usage {#basic}
<GetVisibleRangeTimestamps/>
