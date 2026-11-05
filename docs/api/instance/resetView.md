---
outline: deep
---

# resetView()
`resetView` 把柱间距和右侧偏移恢复成默认值，回到刚加载完的视角。

## 参考 {#reference}
<!--@include: @/@views/api/references/instance/resetView.md-->

### 参数 {#parameters}
`resetView` 不接受任何参数。

### 返回值 {#returns}
`resetView` 返回 `Promise<void>` 。与 `setVisibleRange` 一样，初始化加载完成之前的调用会排在加载之后。

## 用法 {#usage}
<script setup>
import ResetView from '../../@views/api/samples/resetView/index.vue'
</script>

### 基本用法 {#basic}
<ResetView/>
