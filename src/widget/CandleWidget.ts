/**
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at

 * http://www.apache.org/licenses/LICENSE-2.0

 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { candleTypeUsesHighLow, isLineSeriesType } from '../common/Styles'
import type { YAxis } from '../component/YAxis'
import type AxisPane from '../pane/DrawPane'
import CandleAreaView from '../view/CandleAreaView'
import CandleBarView from '../view/CandleBarView'
import CandleHighLowPriceView from '../view/CandleHighLowPriceView'
import CandleHighLowLineView from '../view/CandleHighLowLineView'
import CandleLineView from '../view/CandleLineView'
import CandleLastPriceLineView from '../view/CandleLastPriceLineView'
import CandleTooltipView from '../view/CandleTooltipView'
import CrosshairFeatureView from '../view/CrosshairFeatureView'
import type IndicatorTooltipView from '../view/IndicatorTooltipView'
import IndicatorWidget from './IndicatorWidget'

export default class CandleWidget extends IndicatorWidget {
  private readonly _candleBarView = new CandleBarView(this)
  private readonly _candleAreaView = new CandleAreaView(this)
  private readonly _candleLineView = new CandleLineView(this)
  private readonly _candleHighLowPriceView = new CandleHighLowPriceView(this)
  private readonly _candleHighLowLineView = new CandleHighLowLineView(this)
  private readonly _candleLastPriceLineView = new CandleLastPriceLineView(this)
  private readonly _crosshairFeatureView = new CrosshairFeatureView(this)

  constructor(rootContainer: HTMLElement, pane: AxisPane<YAxis>) {
    super(rootContainer, pane)
    this.addChild(this._candleBarView)
    this.addChild(this._crosshairFeatureView)
  }

  override updateMainContent(ctx: CanvasRenderingContext2D): void {
    const candleStyles = this.getPane().getChart().getStyles().candle
    const type = candleStyles.type
    if (type === 'area') {
      this._candleAreaView.draw(ctx)
    } else {
      this._candleAreaView.stopAnimation()
      if (isLineSeriesType(type)) {
        this._candleLineView.draw(ctx)
      } else {
        this._candleBarView.draw(ctx)
      }
      // A close-only series (area, column, line, step, baseline) has no wick
      // for a high/low label to point at. `hlc_area` and `high_low` do.
      if (candleTypeUsesHighLow(type)) {
        this._candleHighLowPriceView.draw(ctx)
      }
    }
    this._candleHighLowLineView.draw(ctx)
    this._candleLastPriceLineView.draw(ctx)
  }

  override updateOverlayContent(ctx: CanvasRenderingContext2D): void {
    this._crosshairFeatureView.draw(ctx)
  }

  override createTooltipView(): IndicatorTooltipView {
    return new CandleTooltipView(this)
  }

  override destroy(): void {
    this._candleAreaView.stopAnimation()
    super.destroy()
  }
}
