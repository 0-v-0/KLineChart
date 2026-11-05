---
outline: deep
---

# overrideYAxis(options)
`overrideYAxis` set the y-axis configuration.

## Reference {#reference}
<!-- @include: @/@views/api/references/instance/overrideYAxis.md -->

### Parameters {#parameters}
- `options` Y-axis configuration.
  - `paneId` Pane id.
  - `id` Y-axis id.
  - `name` The name of the axis.
  - `reverse` Whether to reverse.
  - `inside` Whether it is inside.
  - `needWidget` Whether to create an axis widget.
  - `position` Position, supports `left` and `right`.
  - `scrollZoomEnabled` Whether to allow scrolling and zooming on the Y-axis. When enabled, users can drag to scroll the axis or use the mouse wheel to zoom.
  - `scaleSeriesOnly` Whether auto scale looks at the series alone; with it on, the candle pane's indicators no longer stretch the range.
  - `priceToBarRatio` The price span one bar width covers, which locks the price scale. A number sets it, `null` locks the ratio showing now. A lock turns auto scale off; the range is re-derived around its centre when the bar space changes, `setRange` updates the ratio, and turning auto scale back on releases it.
  - `gap` Top and bottom margin configuration.
    - `top` Top margin.
    - `bottom` Bottom margin.
  - `createRange` Create an axis value range callback method.
  - `createTicks` Create ticks information callback method.

### Returns {#returns}
`overrideYAxis` returns `undefined` .

## Usage {#usage}
<script setup>
import OverrideYAxisBasic from '../../../@views/api/samples/overrideYAxis-basic/index.vue'
import OverrideYAxisExtension from '../../../@views/api/samples/overrideYAxis-extension/index.vue'
</script>

### Basic attrs {#basic}
<OverrideYAxisBasic/>

### Custom ticks {#extension}
<OverrideYAxisExtension/>
