---
outline: deep
---

# registerLocale(locale, locales)
`registerLocale` 用于扩展多语言。

## 参考 {#reference}
<!--@include: @/@views/api/references/chart/registerLocale.md-->

### 参数 {#parameters}
- `locale` 扩展语言名称。
- `locales` 语言配置。

`locales` 可以是完整配置，也可以只提供需要覆盖的字段。未覆盖的字段会直接显示字段名本身；语言未注册时同样如此，此时不会抛出异常打断渲染，开发环境下会以 `i18n` 为接口名输出一次警告。

### 返回值 {#returns}
`registerLocale` 返回 `undefined` 。

## 用法 {#usage}
<script setup>
import InitLocaleExtension from '../../@views/api/samples/init-locale-extension/index.vue'
import SetLocaleExtension from '../../@views/api/samples/setLocale-extension/index.vue'
</script>

### 初始化时使用 {#init-local}
<InitLocaleExtension />

### 动态设置 {#setLocale}
<SetLocaleExtension />
