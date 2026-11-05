<script setup>
import ChartPreview from '../../../../@components/ChartPreview.vue'
import { data } from './index.data'
</script>

<template>
  <ChartPreview
    title="setMagnetMode"
    chartId="setMagnetMode-chart"
    :code="data.js"/>
</template>
