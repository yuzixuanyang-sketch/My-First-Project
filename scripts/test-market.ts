// 模拟行情自测：覆盖股票清单、历史区间、价格连续性与定时更新
import { mockMarketProvider as marketProvider } from '../src/market/simulator.ts'
import { RANGES } from '../src/types.ts'

const assert = (condition: boolean, message: string) => {
  if (!condition) throw new Error(`FAIL: ${message}`)
  console.log('ok -', message)
}

const metas = marketProvider.getMetas()
const expected = ['AAPL', 'MSFT', 'NVDA', 'AMZN', 'GOOGL', 'TSLA', 'META', 'SPY', 'QQQ']
assert(
  metas.length === expected.length && expected.every((symbol) => metas.some((m) => m.symbol === symbol)),
  '九只股票及 ETF 完整',
)
assert(marketProvider.isSimulated, '行情提供器明确标记为模拟数据')

for (const meta of metas) {
  const quote = marketProvider.getQuote(meta.symbol)
  assert(
    !!quote && [quote.price, quote.prevClose, quote.open, quote.high, quote.low].every((n) => Number.isFinite(n) && n > 0),
    `${meta.symbol} 报价有效且价格为正`,
  )
  assert(
    quote.high >= Math.max(quote.price, quote.open) && quote.low <= Math.min(quote.price, quote.open),
    `${meta.symbol} 最高价与最低价边界正确`,
  )

  for (const { key } of RANGES) {
    const history = marketProvider.getHistory(meta.symbol, key)
    assert(history.length >= 2, `${meta.symbol} ${key} 历史走势有数据`)
    assert(
      history.every((point, index) =>
        Number.isFinite(point.price) && point.price > 0 && (index === 0 || point.t >= history[index - 1].t),
      ),
      `${meta.symbol} ${key} 价格有效且时间连续升序`,
    )
    assert(
      Math.abs(history[history.length - 1].price - quote.price) < 1e-9,
      `${meta.symbol} ${key} 末点与当前报价一致`,
    )
  }
}

const beforeVersion = marketProvider.getVersion()
const beforePrice = marketProvider.getQuote('AAPL')!.price
marketProvider.start()
try {
  await new Promise((resolve) => setTimeout(resolve, 3300))
  const afterPrice = marketProvider.getQuote('AAPL')!.price
  assert(marketProvider.getVersion() > beforeVersion, '行情定时器产生新 tick')
  assert(afterPrice > 0 && afterPrice !== beforePrice, '实时价格更新且保持正数')
  assert(Math.abs(afterPrice / beforePrice - 1) < 0.05, '单次价格波动连续合理')
} finally {
  marketProvider.stop()
}

console.log('\n模拟行情全部断言通过')
