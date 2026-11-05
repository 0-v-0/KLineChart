<script setup>
import ChartPreview from '../../../../@components/ChartPreview.vue'
import { data } from './index.data'
</script>

<template>
  <ChartPreview
    title="setBarColorResolver"
    chartId="setBarColorResolver-chart"
    :code="data.js"/>
</template>
