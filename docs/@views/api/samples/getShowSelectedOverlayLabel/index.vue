<script setup>
import ChartPreview from '../../../../@components/ChartPreview.vue'
import { data } from './index.data'
</script>

<template>
  <ChartPreview
    title="getShowSelectedOverlayLabel"
    chartId="getShowSelectedOverlayLabel-chart"
    :code="data.js"/>
</template>
