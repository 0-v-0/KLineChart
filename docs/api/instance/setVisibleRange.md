---
outline: deep
---

# setVisibleRange(range)
`setVisibleRange` 按时间设置可见区间，区间之前的数据会先加载回来。

## 参考 {#reference}
<!--@include: @/@views/api/references/instance/setVisibleRange.md-->

### 参数 {#parameters}
- `range` 区间。
  - `from` 起始时间戳，毫秒。
  - `to` 结束时间戳，毫秒。

### 返回值 {#returns}
`setVisibleRange` 返回 `Promise<void>` 。如果在初始化加载完成之前调用，会在加载完成后执行；在此之前再次调用会取代上一次调用。

## 用法 {#usage}
<script setup>
import SetVisibleRange from '../../@views/api/samples/setVisibleRange/index.vue'
</script>

### 基本用法 {#basic}
<SetVisibleRange/>
