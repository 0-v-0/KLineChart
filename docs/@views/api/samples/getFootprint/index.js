import { init } from 'klinecharts'

const chart = init('getFootprint-chart')

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

const data = chart.getDataList()
console.log(chart.getFootprint(data[0]))
