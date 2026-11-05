---
outline: deep
---

# setOverlayVisibilityResolver(resolver)
`setOverlayVisibilityResolver` set whether an overlay is drawn, so a host can hide drawings without removing them.

## Reference {#reference}
<!--@include: @/@views/api/references/instance/setOverlayVisibilityResolver.md-->

### Parameters {#parameters}
- `resolver` Called with one overlay; returns whether to draw it. Pass `null` to clear it.

### Returns {#returns}
`setOverlayVisibilityResolver` returns `undefined` .

## Usage {#usage}
<script setup>
import SetOverlayVisibilityResolver from '../../../@views/api/samples/setOverlayVisibilityResolver/index.vue'
</script>

### Basic usage {#basic}
<SetOverlayVisibilityResolver/>
