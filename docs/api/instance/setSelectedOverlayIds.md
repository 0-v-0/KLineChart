---
outline: deep
---

# setSelectedOverlayIds(ids)
`setSelectedOverlayIds` 设置选中覆盖物，传入空数组即取消全部选中。

## 参考 {#reference}
<!--@include: @/@views/api/references/instance/setSelectedOverlayIds.md-->

### 参数 {#parameters}
- `ids` 覆盖物 id 列表，不存在的 id 会被忽略。

### 返回值 {#returns}
`setSelectedOverlayIds` 返回 `undefined` 。

## 用法 {#usage}
<script setup>
import SetSelectedOverlayIds from '../../@views/api/samples/setSelectedOverlayIds/index.vue'
</script>

### 基本用法 {#basic}
<SetSelectedOverlayIds/>
