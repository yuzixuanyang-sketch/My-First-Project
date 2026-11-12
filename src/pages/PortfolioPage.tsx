import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAccount } from '../store/AccountContext'
import { useMarket } from '../market/MarketContext'
import { marketProvider } from '../market/provider'
import { summarize } from '../store/account'
import { fmtPct, fmtSigned, fmtUSD } from '../utils/format'

function nameOf(symbol: string): string {
  return marketProvider.getMetas().find((m) => m.symbol === symbol)?.name ?? symbol
}

/** 我的资产：账户总览 + 持仓明细 + 重置 */
export default function PortfolioPage() {
  const { account, reset } = useAccount()
  const { quotes, isSimulated } = useMarket()
  const [confirming, setConfirming] = useState(false)
  const s = summarize(account, quotes, nameOf)
  const missingQuotes = s.positions.filter((position) => !quotes.has(position.symbol))

  const cards = [
    { label: '总资产', value: fmtUSD(s.totalAssets), cls: 'text-white' },
    { label: '可用现金', value: fmtUSD(s.cash), cls: 'text-white' },
    { label: '持仓市值', value: fmtUSD(s.marketValue), cls: 'text-white' },
    {
      label: '总盈亏',
      value: `${fmtSigned(s.totalPnl)}（${fmtPct(s.totalReturnPct)}）`,
      cls: s.totalPnl >= 0 ? 'text-term-up' : 'text-term-down',
    },
    {
      label: '未实现盈亏',
      value: fmtSigned(s.unrealizedPnl),
      cls: s.unrealizedPnl >= 0 ? 'text-term-up' : 'text-term-down',
    },
    {
      label: '已实现盈亏',
      value: fmtSigned(s.realizedPnl),
      cls: s.realizedPnl >= 0 ? 'text-term-up' : 'text-term-down',
    },
  ]

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-white">我的资产</h1>
          <p className="mt-1 text-sm text-term-muted">
            初始资金 $100,000 · 随
            {isSimulated ? '本地模拟行情' : 'Alpaca IEX 实时行情'}估值，交易仍全部使用虚拟资金
          </p>
        </div>
        <button
          onClick={() => setConfirming(true)}
          className="rounded-md border border-term-down/50 px-3 py-1.5 text-sm text-term-down hover:bg-term-down/10"
        >
          重置模拟账户
        </button>
      </div>

      {missingQuotes.length > 0 && (
        <div className="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-300">
          {missingQuotes.length} 个持仓暂无当前 IEX 报价，暂以持仓成本估值；不会使用随机数据代替。
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        {cards.map((c) => (
          <div key={c.label} className="rounded-lg border border-term-border bg-term-panel p-4">
            <div className="text-xs text-term-muted">{c.label}</div>
            <div className={`num mt-1.5 text-lg font-semibold ${c.cls}`}>{c.value}</div>
          </div>
        ))}
      </div>

      <div className="mt-5 rounded-lg border border-term-border bg-term-panel">
        <div className="border-b border-term-border px-4 py-3 text-sm font-medium text-white">
          持仓（{s.positions.length}）
        </div>
        {s.positions.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-term-muted">
            暂无持仓，前往
            <Link to="/" className="mx-1 text-term-accent hover:underline">
              行情页
            </Link>
            开始第一笔模拟交易
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b border-term-border text-left text-xs text-term-muted">
                  <th className="px-4 py-2.5 font-medium">代码 / 名称</th>
                  <th className="px-4 py-2.5 text-right font-medium">数量</th>
                  <th className="px-4 py-2.5 text-right font-medium">平均成本</th>
                  <th className="px-4 py-2.5 text-right font-medium">
                    现价（{isSimulated ? '模拟' : 'IEX'}）
                  </th>
                  <th className="px-4 py-2.5 text-right font-medium">市值</th>
                  <th className="px-4 py-2.5 text-right font-medium">未实现盈亏</th>
                </tr>
              </thead>
              <tbody>
                {s.positions.map((p) => (
                  <tr
                    key={p.symbol}
                    className="border-b border-term-border/60 last:border-0 hover:bg-term-panel2"
                  >
                    <td className="px-4 py-3">
                      <Link to={`/stock/${p.symbol}`} className="hover:text-term-accent">
                        <div className="font-medium text-white">{p.symbol}</div>
                        <div className="text-xs text-term-muted">{p.name}</div>
                      </Link>
                    </td>
                    <td className="num px-4 py-3 text-right">{p.qty}</td>
                    <td className="num px-4 py-3 text-right">{fmtUSD(p.avgCost)}</td>
                    <td className="num px-4 py-3 text-right">{fmtUSD(p.price)}</td>
                    <td className="num px-4 py-3 text-right">{fmtUSD(p.marketValue)}</td>
                    <td
                      className={`num px-4 py-3 text-right ${
                        p.unrealizedPnl >= 0 ? 'text-term-up' : 'text-term-down'
                      }`}
                    >
                      {fmtSigned(p.unrealizedPnl)}
                      <div className="text-xs">{fmtPct(p.unrealizedPct)}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 重置二次确认弹窗 */}
      {confirming && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setConfirming(false)}
        >
          <div
            className="w-full max-w-sm rounded-xl border border-term-border bg-term-panel p-5"
            role="dialog"
            aria-modal="true"
            aria-labelledby="reset-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div id="reset-title" className="text-base font-semibold text-white">确认重置模拟账户？</div>
            <p className="mt-2 text-sm leading-6 text-term-muted">
              重置后将恢复初始资金 <span className="num text-white">$100,000</span>，
              并<strong className="text-term-down">清空全部持仓与交易记录</strong>，该操作不可撤销。
            </p>
            <div className="mt-5 flex gap-3">
              <button
                onClick={() => setConfirming(false)}
                className="flex-1 rounded-md border border-term-border px-4 py-2 text-sm text-term-text hover:bg-term-panel2"
              >
                取消
              </button>
              <button
                onClick={() => {
                  reset()
                  setConfirming(false)
                }}
                className="flex-1 rounded-md bg-term-down px-4 py-2 text-sm font-medium text-white hover:brightness-110"
              >
                确认重置
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
