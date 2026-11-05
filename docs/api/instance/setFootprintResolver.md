---
outline: deep
---

# setFootprintResolver(resolver)
`setFootprintResolver` 设置足迹图的逐价数据来源，K 线数据本身不带这些数据，需要由外部提供。

## 参考 {#reference}
<!--@include: @/@views/api/references/instance/setFootprintResolver.md-->

### 参数 {#parameters}
- `resolver` 回调，参数为一根柱子数据，返回该柱子的足迹数据或 `null` 。传 `null` 取消。

### 返回值 {#returns}
`setFootprintResolver` 返回 `undefined` 。

## 用法 {#usage}
<script setup>
import SetFootprintResolver from '../../@views/api/samples/setFootprintResolver/index.vue'
</script>

### 基本用法 {#basic}
<SetFootprintResolver/>
