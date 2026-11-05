---
outline: deep
---

# getFootprint(data)
`getFootprint` 获取一根柱子的足迹数据，取的就是 `setFootprintResolver` 返回的内容。

## 参考 {#reference}
<!--@include: @/@views/api/references/instance/getFootprint.md-->

### 参数 {#parameters}
- `data` 柱子数据。

### 返回值 {#returns}
`getFootprint` 返回足迹数据或 `null` 。

## 用法 {#usage}
<script setup>
import GetFootprint from '../../@views/api/samples/getFootprint/index.vue'
</script>

### 基本用法 {#basic}
<GetFootprint/>
