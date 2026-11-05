---
outline: deep
---

# setMagnetMode(mode)
`setMagnetMode` 设置十字光标的磁吸强度。

## 参考 {#reference}
<!--@include: @/@views/api/references/instance/setMagnetMode.md-->

### 参数 {#parameters}
- `mode` 磁吸强度，支持 `normal` 、 `weak` 和 `strong` 。
  - `normal` 不磁吸。
  - `weak` 只把横向位置吸附到最近的柱子中心。
  - `strong` 在 `weak` 的基础上，把纵向位置再吸附到该柱子的开高低收。

### 返回值 {#returns}
`setMagnetMode` 返回 `undefined` 。

## 用法 {#usage}
<script setup>
import SetMagnetMode from '../../@views/api/samples/setMagnetMode/index.vue'
</script>

### 基本用法 {#basic}
<SetMagnetMode/>
