import { init } from 'klinecharts'

const chart = init('nudgeOverlays-chart')

chart.setSymbol({ ticker: 'TestSymbol' })
chart.setPeriod({ span: 1, type: 'day' })
chart.setDataLoader({
  getBars: ({ callback }) => {
    fetch('https://klinecharts.com/datas/kline.json')
      .then((res) => res.json())
      .then((dataList) => {
        callback(dataList)
      })
  }
})

chart.setSelectedOverlayIds([chart.createOverlay('segment')])
chart.nudgeOverlays(chart.getSelectedOverlayIds(), 'right')
