import { init } from 'klinecharts'

const chart = init('setVisibleRange-chart')

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

const dataList = chart.getDataList()
chart.setVisibleRange({
  from: dataList[dataList.length - 30].timestamp,
  to: dataList[dataList.length - 1].timestamp
})
