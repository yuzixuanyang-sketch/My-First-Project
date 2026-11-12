import { Link } from 'react-router-dom'
import { useMarket } from '../market/MarketContext'
import { marketProvider } from '../market/provider'
import Sparkline from '../components/Sparkline'
import { fmtPct, fmtSigned, fmtUSD } from '../utils/format'

/** 行情首页：全部股票 / ETF 列表 */
export default function MarketPage() {
  const { quotes, status, isSimulated, lastUpdated } = useMarket()
  const metas = marketProvider.getMetas()

  return (
    <div>
      <div className="mb-4 flex items-end justify-between">
        <div>
          <h1 className="text-xl font-semibold text-white">行情</h1>
          <p className="mt-1 text-sm text-term-muted">
            {isSimulated
              ? '本地模拟备用行情 · 非真实市场报价'
              : `Alpaca IEX 实时行情 · 单一交易所，非 SIP 全市场 · 更新 ${lastUpdated ? new Date(lastUpdated).toLocaleTimeString('zh-CN', { hour12: false }) : '暂无'}`}
          </p>
        </div>
      </div>

      {status.state === 'unavailable' || status.state === 'error' ? (
        <div className="mb-4 rounded-lg border border-term-down/50 bg-term-down/10 px-4 py-3 text-sm text-term-down">
          真实 IEX 行情当前不可用：{status.message}
          。不会使用随机数据代替，可在上方切换到本地模拟备用模式。
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {metas.map((meta) => {
          const quote = quotes.get(meta.symbol)
          const change = quote ? quote.price - quote.prevClose : null
          const pct = quote ? change! / quote.prevClose : null
          const up = quote ? change! >= 0 : false
          const spark = marketProvider.getHistory(meta.symbol, '1W').map((point) => point.price)
          return (
            <Link
              key={meta.symbol}
              to={`/stock/${meta.symbol}`}
              className="group rounded-lg border border-term-border bg-term-panel p-4 transition-colors hover:border-term-accent/60 hover:bg-term-panel2"
            >
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-semibold text-white group-hover:text-term-accent">
                    {meta.symbol}
                  </div>
                  <div className="mt-0.5 text-xs text-term-muted">{meta.name}</div>
                </div>
                {spark.length > 1 ? (
                  <Sparkline data={spark} up={up} />
                ) : (
                  <div className="h-8 w-24 rounded border border-dashed border-term-border" />
                )}
              </div>
              {quote ? (
                <div className="mt-3 flex items-end justify-between">
                  <div className="num text-lg font-semibold text-white">{fmtUSD(quote.price)}</div>
                  <div className={`num text-right text-sm ${up ? 'text-term-up' : 'text-term-down'}`}>
                    <div>{fmtSigned(change!)}</div>
                    <div>{fmtPct(pct!)}</div>
                  </div>
                </div>
              ) : (
                <div className="mt-3 flex items-end justify-between">
                  <div className="num text-lg font-semibold text-term-muted">--</div>
                  <div className="text-xs text-term-muted">IEX 数据不可用</div>
                </div>
              )}
            </Link>
          )
        })}
      </div>
    </div>
  )
}
