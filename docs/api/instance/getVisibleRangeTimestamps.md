---
outline: deep
---

# getVisibleRangeTimestamps()
`getVisibleRangeTimestamps` 获取可见区间两端的时间戳；没有数据时返回 `null` 。

## 参考 {#reference}
<!--@include: @/@views/api/references/instance/getVisibleRangeTimestamps.md-->

### 参数 {#parameters}
`getVisibleRangeTimestamps` 不接受任何参数。

### 返回值 {#returns}
`getVisibleRangeTimestamps` 返回 `{ from, to }` 或 `null` ，单位毫秒。

## 用法 {#usage}
<script setup>
import GetVisibleRangeTimestamps from '../../@views/api/samples/getVisibleRangeTimestamps/index.vue'
</script>

### 基本用法 {#basic}
<GetVisibleRangeTimestamps/>
