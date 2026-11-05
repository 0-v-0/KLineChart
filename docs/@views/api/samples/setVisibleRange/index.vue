<script setup>
import ChartPreview from '../../../../@components/ChartPreview.vue'
import { data } from './index.data'
</script>

<template>
  <ChartPreview
    title="setVisibleRange"
    chartId="setVisibleRange-chart"
    :code="data.js"/>
</template>
