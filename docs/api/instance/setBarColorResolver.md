---
outline: deep
---

# setBarColorResolver(resolver)
`setBarColorResolver` 设置柱子的颜色来源，返回的颜色会作为该柱子的主色，返回 `null` 则按样式着色。

## 参考 {#reference}
<!--@include: @/@views/api/references/instance/setBarColorResolver.md-->

### 参数 {#parameters}
- `resolver` 回调，参数为一根柱子数据，返回颜色字符串或 `null` 。传 `null` 取消。

### 返回值 {#returns}
`setBarColorResolver` 返回 `undefined` 。

## 用法 {#usage}
<script setup>
import SetBarColorResolver from '../../@views/api/samples/setBarColorResolver/index.vue'
</script>

### 基本用法 {#basic}
<SetBarColorResolver/>
