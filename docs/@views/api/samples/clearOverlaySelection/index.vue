<script setup>
import ChartPreview from '../../../../@components/ChartPreview.vue'
import { data } from './index.data'
</script>

<template>
  <ChartPreview
    title="clearOverlaySelection"
    chartId="clearOverlaySelection-chart"
    :code="data.js"/>
</template>
