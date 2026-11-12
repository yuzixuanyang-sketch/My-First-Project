import { Link } from 'react-router-dom'
import { useAccount } from '../store/AccountContext'
import { fmtTime, fmtUSD } from '../utils/format'

/** 交易记录：历史成交列表（最新在前） */
export default function TradesPage() {
  const { account } = useAccount()
  const trades = account.trades

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-xl font-semibold text-white">交易记录</h1>
        <p className="mt-1 text-sm text-term-muted">
          共 {trades.length} 笔模拟成交 · 保存在本机浏览器中
        </p>
      </div>

      <div className="rounded-lg border border-term-border bg-term-panel">
        {trades.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-term-muted">
            暂无交易记录，前往
            <Link to="/" className="mx-1 text-term-accent hover:underline">
              行情页
            </Link>
            开始模拟交易
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-term-border text-left text-xs text-term-muted">
                  <th className="px-4 py-2.5 font-medium">时间</th>
                  <th className="px-4 py-2.5 font-medium">股票</th>
                  <th className="px-4 py-2.5 font-medium">方向</th>
                  <th className="px-4 py-2.5 text-right font-medium">成交价（模拟）</th>
                  <th className="px-4 py-2.5 text-right font-medium">数量</th>
                  <th className="px-4 py-2.5 text-right font-medium">金额</th>
                </tr>
              </thead>
              <tbody>
                {trades.map((t) => (
                  <tr
                    key={t.id}
                    className="border-b border-term-border/60 last:border-0 hover:bg-term-panel2"
                  >
                    <td className="num px-4 py-3 text-term-muted">{fmtTime(t.time)}</td>
                    <td className="px-4 py-3">
                      <Link to={`/stock/${t.symbol}`} className="hover:text-term-accent">
                        <span className="font-medium text-white">{t.symbol}</span>
                        <span className="ml-1.5 text-xs text-term-muted">{t.name}</span>
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded px-1.5 py-0.5 text-xs font-semibold ${
                          t.side === 'BUY'
                            ? 'bg-term-up/15 text-term-up'
                            : 'bg-term-down/15 text-term-down'
                        }`}
                      >
                        {t.side === 'BUY' ? '买入' : '卖出'}
                      </span>
                    </td>
                    <td className="num px-4 py-3 text-right">{fmtUSD(t.price)}</td>
                    <td className="num px-4 py-3 text-right">{t.qty}</td>
                    <td className="num px-4 py-3 text-right text-white">{fmtUSD(t.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
