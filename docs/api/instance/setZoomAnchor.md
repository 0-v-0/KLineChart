---
outline: deep
---

# setZoomAnchor(anchor)
`setZoomAnchor` 设置主窗格和 x 轴窗格的缩放锚点。

## 参考 {#reference}
<!--@include: @/@views/api/references/instance/setZoomAnchor.md-->

### 参数 {#parameters}
- `anchor`: 主窗格和 x 轴窗格的缩放锚点类型, 支持 `cursor` ， `last_bar` ， `right_edge` 和 `{ main, xAxis }` 对象形式。
  - `cursor` 以鼠标位置为锚点，鼠标下的位置缩放前后不变。
  - `last_bar` 以最后一根柱子为锚点。
  - `right_edge` 以右边缘为锚点，右边缘所在的柱子缩放前后留在原位，最后一根柱子右侧的留白也一起缩放。

### 返回值 {#returns}
`setZoomAnchor` 返回 `undefined` 。

## 用法 {#usage}
<script setup>
import SetZoomAnchor from '../../@views/api/samples/setZoomAnchor/index.vue'
</script>

### 基本用法 {#basic}
<SetZoomAnchor/>