---
outline: deep
---

# setFootprintResolver(resolver)
`setFootprintResolver` set where a footprint bar’s per-price data comes from; the K-line data itself does not carry it.

## Reference {#reference}
<!--@include: @/@views/api/references/instance/setFootprintResolver.md-->

### Parameters {#parameters}
- `resolver` Called with one bar; returns its footprint data or `null`. Pass `null` to clear it.

### Returns {#returns}
`setFootprintResolver` returns `undefined` .

## Usage {#usage}
<script setup>
import SetFootprintResolver from '../../../@views/api/samples/setFootprintResolver/index.vue'
</script>

### Basic usage {#basic}
<SetFootprintResolver/>
