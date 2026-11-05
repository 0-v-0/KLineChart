<script setup>
import ChartPreview from '../../../../@components/ChartPreview.vue'
import { data } from './index.data'
</script>

<template>
  <ChartPreview
    title="nudgeOverlays"
    chartId="nudgeOverlays-chart"
    :code="data.js"/>
</template>
