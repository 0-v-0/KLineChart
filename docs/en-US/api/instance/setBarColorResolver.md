---
outline: deep
---

# setBarColorResolver(resolver)
`setBarColorResolver` set where a bar's colour comes from; the colour it returns paints that bar, `null` falls back to the styles.

## Reference {#reference}
<!--@include: @/@views/api/references/instance/setBarColorResolver.md-->

### Parameters {#parameters}
- `resolver` Called with one bar; returns a colour string or `null`. Pass `null` to clear it.

### Returns {#returns}
`setBarColorResolver` returns `undefined` .

## Usage {#usage}
<script setup>
import SetBarColorResolver from '../../../@views/api/samples/setBarColorResolver/index.vue'
</script>

### Basic usage {#basic}
<SetBarColorResolver/>
