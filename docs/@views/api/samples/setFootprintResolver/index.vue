<script setup>
import ChartPreview from '../../../../@components/ChartPreview.vue'
import { data } from './index.data'
</script>

<template>
  <ChartPreview
    title="setFootprintResolver"
    chartId="setFootprintResolver-chart"
    :code="data.js"/>
</template>
