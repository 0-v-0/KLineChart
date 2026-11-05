<script setup>
import ChartPreview from '../../../../@components/ChartPreview.vue'
import { data } from './index.data'
</script>

<template>
  <ChartPreview
    title="setShowSeconds"
    chartId="setShowSeconds-chart"
    :code="data.js"/>
</template>
