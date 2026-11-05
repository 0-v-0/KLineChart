import { init } from 'klinecharts'

const chart = init('setBarColorResolver-chart')

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

chart.setBarColorResolver((data) => (data.close >= data.open ? '#089981' : '#CC2F3C'))
