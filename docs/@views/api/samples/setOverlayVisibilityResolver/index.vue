<script setup>
import ChartPreview from '../../../../@components/ChartPreview.vue'
import { data } from './index.data'
</script>

<template>
  <ChartPreview
    title="setOverlayVisibilityResolver"
    chartId="setOverlayVisibilityResolver-chart"
    :code="data.js"/>
</template>
