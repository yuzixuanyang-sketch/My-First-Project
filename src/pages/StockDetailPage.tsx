import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useMarket } from '../market/MarketContext'
import { useAccount } from '../store/AccountContext'
import { marketProvider } from '../market/provider'
import PriceChart from '../components/PriceChart'
import TradeModal from '../components/TradeModal'
import { RANGES, type RangeKey } from '../types'
import { fmtPct, fmtSigned, fmtTime, fmtUSD, fmtVolume } from '../utils/format'

/** 股票详情页：报价、OHLC、成交量、走势图、交易入口 */
export default function StockDetailPage() {
  const { symbol = '' } = useParams()
  const { quotes, isSimulated, mode } = useMarket()
  const { account } = useAccount()
  const meta = marketProvider.getMetas().find((item) => item.symbol === symbol)
  const quote = quotes.get(symbol)

  const [range, setRange] = useState<RangeKey>('1D')
  const [tradeSide, setTradeSide] = useState<'BUY' | 'SELL' | null>(null)
  const [historyError, setHistoryError] = useState<{ key: string; message: string } | null>(null)
  const activeHistoryKey = `${symbol}:${range}`

  useEffect(() => {
    if (isSimulated) return
    let cancelled = false
    marketProvider
      .loadHistory(symbol, range)
      .then(() => {
        if (!cancelled) setHistoryError(null)
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setHistoryError({
            key: `${symbol}:${range}`,
            message: error instanceof Error ? error.message : '真实历史 K 线获取失败',
          })
        }
      })
    return () => {
      cancelled = true
    }
  }, [symbol, range, isSimulated, mode])

  const history = marketProvider.getHistory(symbol, range)
  const shownHistoryError =
    historyError?.key === activeHistoryKey ? historyError.message : ''

  if (!meta) {
    return (
      <div className="py-20 text-center">
        <div className="text-term-muted">未找到该股票</div>
        <Link to="/" className="mt-3 inline-block text-sm text-term-accent hover:underline">
          返回行情首页
        </Link>
      </div>
    )
  }

  if (!quote) {
    return (
      <div>
        <Link to="/" className="text-sm text-term-muted hover:text-white">
          ← 返回行情
        </Link>
        <div className="mt-4 rounded-lg border border-term-down/50 bg-term-down/10 px-4 py-6 text-center">
          <div className="text-sm font-medium text-term-down">
            {isSimulated ? '该股票模拟行情不可用' : 'Alpaca IEX 实时行情暂不可用'}
          </div>
          <p className="mt-2 text-xs leading-5 text-term-muted">
            {isSimulated
              ? '请刷新页面或返回行情首页重试。'
              : '未获取到该股票的 IEX 报价。不会使用随机数据代替，请检查网络、密钥或稍后重试。'}
          </p>
          <Link to="/" className="mt-3 inline-block text-sm text-term-accent hover:underline">
            返回行情首页
          </Link>
        </div>
      </div>
    )
  }

  const change = quote.price - quote.prevClose
  const pct = change / quote.prevClose
  const up = change >= 0
  const colorCls = up ? 'text-term-up' : 'text-term-down'
  const position = account.positions[symbol]
  const stats = [
    { label: '开盘价', value: fmtUSD(quote.open) },
    { label: '最高价', value: fmtUSD(quote.high) },
    { label: '最低价', value: fmtUSD(quote.low) },
    { label: isSimulated ? '成交量（模拟）' : '成交量（IEX）', value: fmtVolume(quote.volume) },
  ]
  if (!isSimulated) {
    stats.push(
      { label: 'IEX 买价', value: quote.bid != null ? fmtUSD(quote.bid) : '--' },
      { label: 'IEX 卖价', value: quote.ask != null ? fmtUSD(quote.ask) : '--' },
    )
  }

  return (
    <div>
      <Link to="/" className="text-sm text-term-muted hover:text-white">
        ← 返回行情
      </Link>

      {/* 报价头部 */}
      <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-baseline gap-3">
            <h1 className="text-2xl font-semibold text-white">{meta.name}</h1>
            <span className="text-term-muted">{meta.symbol}</span>
            <span
              className={`rounded border px-1.5 py-0.5 text-[11px] ${
                isSimulated
                  ? 'border-amber-500/40 bg-amber-500/10 text-amber-400'
                  : 'border-term-up/40 bg-term-up/10 text-term-up'
              }`}
            >
              {isSimulated ? '本地模拟行情' : 'Alpaca IEX 实时 · 非 SIP'}
            </span>
          </div>
          <div className="mt-2 flex flex-wrap items-baseline gap-3">
            <span className={`num text-3xl font-bold ${colorCls}`}>{fmtUSD(quote.price)}</span>
            <span className={`num text-sm ${colorCls}`}>
              {fmtSigned(change)}（{fmtPct(pct)}）
            </span>
          </div>
          <div className="mt-1 text-xs text-term-muted">
            {isSimulated
              ? `昨收 ${fmtUSD(quote.prevClose)} · 价格每 3 秒本地模拟波动`
              : `昨收 ${fmtUSD(quote.prevClose)} · 数据更新 ${
                  quote.updatedAt ? fmtTime(quote.updatedAt) : '暂无'
                } · IEX 成交/报价`}
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setTradeSide('BUY')}
            className="rounded-md bg-term-up px-6 py-2.5 text-sm font-semibold text-white hover:brightness-110"
          >
            买入
          </button>
          <button
            onClick={() => setTradeSide('SELL')}
            className="rounded-md bg-term-down px-6 py-2.5 text-sm font-semibold text-white hover:brightness-110"
          >
            卖出
          </button>
        </div>
      </div>

      {/* 当日统计 */}
      <div className={`mt-4 grid grid-cols-2 gap-3 ${isSimulated ? 'sm:grid-cols-4' : 'sm:grid-cols-3 lg:grid-cols-6'}`}>
        {stats.map((stat) => (
          <div key={stat.label} className="rounded-md border border-term-border bg-term-panel p-3">
            <div className="text-xs text-term-muted">{stat.label}</div>
            <div className="num mt-1 text-sm font-medium text-white">{stat.value}</div>
          </div>
        ))}
      </div>

      {/* 走势图 */}
      <div className="mt-4 rounded-lg border border-term-border bg-term-panel p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="text-sm font-medium text-white">价格走势</div>
          <div className="flex gap-1">
            {RANGES.map((item) => (
              <button
                key={item.key}
                onClick={() => setRange(item.key)}
                className={`rounded px-2.5 py-1 text-xs ${
                  range === item.key
                    ? 'bg-term-accent/20 text-white'
                    : 'text-term-muted hover:text-term-text'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
        {history.length > 1 ? (
          <PriceChart data={history} range={range} valueLabel={isSimulated ? '模拟价格' : 'IEX 价格'} />
        ) : (
          <div className="flex h-[320px] items-center justify-center rounded-md border border-dashed border-term-border px-4 text-center text-sm text-term-muted">
            {isSimulated
              ? '当前时间范围暂无模拟历史数据。'
              : shownHistoryError
                ? `真实历史 K 线不可用：${shownHistoryError}`
                : '正在从 Alpaca IEX 获取历史 K 线…'}
          </div>
        )}
      </div>

      {/* 我的持仓 */}
      {position && (
        <div className="mt-4 rounded-lg border border-term-border bg-term-panel p-4">
          <div className="text-sm font-medium text-white">我的持仓</div>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div>
              <div className="text-xs text-term-muted">持有数量</div>
              <div className="num mt-1 text-sm text-white">{position.qty} 股</div>
            </div>
            <div>
              <div className="text-xs text-term-muted">平均成本</div>
              <div className="num mt-1 text-sm text-white">{fmtUSD(position.avgCost)}</div>
            </div>
            <div>
              <div className="text-xs text-term-muted">持仓市值</div>
              <div className="num mt-1 text-sm text-white">
                {fmtUSD(position.qty * quote.price)}
              </div>
            </div>
            <div>
              <div className="text-xs text-term-muted">未实现盈亏</div>
              <div
                className={`num mt-1 text-sm ${
                  quote.price >= position.avgCost ? 'text-term-up' : 'text-term-down'
                }`}
              >
                {fmtSigned((quote.price - position.avgCost) * position.qty)}（
                {fmtPct((quote.price - position.avgCost) / position.avgCost)}）
              </div>
            </div>
          </div>
        </div>
      )}

      {tradeSide && (
        <TradeModal
          symbol={symbol}
          name={meta.name}
          side={tradeSide}
          onClose={() => setTradeSide(null)}
        />
      )}
    </div>
  )
}
