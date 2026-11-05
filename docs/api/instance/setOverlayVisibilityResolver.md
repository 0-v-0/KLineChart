---
outline: deep
---

# setOverlayVisibilityResolver(resolver)
`setOverlayVisibilityResolver` 设置覆盖物是否绘制的判断，用于按自己的规则隐藏覆盖物而不删除它们。

## 参考 {#reference}
<!--@include: @/@views/api/references/instance/setOverlayVisibilityResolver.md-->

### 参数 {#parameters}
- `resolver` 回调，参数为一个覆盖物，返回是否绘制。传 `null` 取消。

### 返回值 {#returns}
`setOverlayVisibilityResolver` 返回 `undefined` 。

## 用法 {#usage}
<script setup>
import SetOverlayVisibilityResolver from '../../@views/api/samples/setOverlayVisibilityResolver/index.vue'
</script>

### 基本用法 {#basic}
<SetOverlayVisibilityResolver/>
