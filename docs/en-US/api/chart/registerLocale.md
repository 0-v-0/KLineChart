---
outline: deep
---

# registerLocale(locale, locales)
`registerLocale` used to custom locale.

## Reference {#reference}
<!--@include: @/@views/api/references/chart/registerLocale.md-->

### Parameters {#parameters}
- `locale` Locale name.
- `locales` Locale configuration.

`locales` may be a whole configuration or only the fields to override. Fields that are not covered are displayed as the field name itself. The same happens when the locale is not registered: rendering is not interrupted by an exception, and one warning is logged with `i18n` as the api name in the development environment.

### Returns {#returns}
`registerLocale` returns `undefined` .

## Usage {#usage}
<script setup>
import InitLocaleExtension from '../../../@views/api/samples/init-locale-extension/index.vue'
import SetLocaleExtension from '../../../@views/api/samples/setLocale-extension/index.vue'
</script>

### Using initialization {#init-local}
<InitLocaleExtension />

### Dynamic settings {#setLocale}
<SetLocaleExtension />
