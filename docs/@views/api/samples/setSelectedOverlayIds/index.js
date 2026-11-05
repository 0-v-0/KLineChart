import { init } from 'klinecharts'

const chart = init('setSelectedOverlayIds-chart')

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

const ids = chart.getOverlays().map((overlay) => overlay.id)
chart.setSelectedOverlayIds(ids.slice(0, 2))
