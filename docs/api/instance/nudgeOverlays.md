---
outline: deep
---

# nudgeOverlays(ids, direction)
`nudgeOverlays` 把覆盖物沿一个方向移动一个像素，供键盘微调使用。

## 参考 {#reference}
<!--@include: @/@views/api/references/instance/nudgeOverlays.md-->

### 参数 {#parameters}
- `ids` 覆盖物 id 列表。
  - `direction` 方向，支持 `left` 、 `right` 、 `up` 和 `down` 。

### 返回值 {#returns}
`nudgeOverlays` 返回 `boolean` ，表示是否真的移动了。

## 用法 {#usage}
<script setup>
import NudgeOverlays from '../../@views/api/samples/nudgeOverlays/index.vue'
</script>

### 基本用法 {#basic}
<NudgeOverlays/>
