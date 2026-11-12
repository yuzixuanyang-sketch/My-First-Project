import { NavLink, Outlet } from 'react-router-dom'
import { useMarket } from '../market/MarketContext'
import MarketStatusBar, { MarketSourceBadge } from './MarketStatusBar'

const NAV = [
  { to: '/', label: '行情', icon: 'M3 17l5-5 4 4 8-9M15 7h5v5' },
  { to: '/portfolio', label: '我的资产', icon: 'M4 7h16v13H4zM9 7V4h6v3M4 12h16' },
  { to: '/trades', label: '交易记录', icon: 'M7 3h10v18H7zM10 8h4M10 12h4M10 16h4' },
]

export default function Layout() {
  const { tick, isSimulated } = useMarket()
  return (
    <div className="min-h-full bg-term-bg text-term-text">
      {/* 桌面端侧边栏 */}
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-52 flex-col border-r border-term-border bg-term-panel md:flex">
        <div className="border-b border-term-border px-5 py-4">
          <div className="text-base font-semibold text-white">美股模拟交易</div>
          <div className="mt-0.5 text-xs text-term-muted">Paper Trading Terminal</div>
        </div>
        <nav className="flex-1 space-y-1 p-3">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors ${
                  isActive
                    ? 'bg-term-accent/15 text-white'
                    : 'text-term-muted hover:bg-term-panel2 hover:text-term-text'
                }`
              }
            >
              <svg
                viewBox="0 0 24 24"
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d={n.icon} />
              </svg>
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-term-border p-4">
          <MarketSourceBadge />
          <div className="mt-2 text-[11px] leading-4 text-term-muted">
            本平台仅供学习练习，不涉及真实资金与真实交易。
          </div>
        </div>
      </aside>

      {/* 移动端顶栏 */}
      <header className="sticky top-0 z-20 border-b border-term-border bg-term-panel/95 backdrop-blur md:hidden">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="text-sm font-semibold text-white">美股模拟交易</div>
          <MarketSourceBadge />
        </div>
        <nav className="flex border-t border-term-border">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.to === '/'}
              className={({ isActive }) =>
                `flex-1 py-2 text-center text-sm ${
                  isActive ? 'text-white shadow-[inset_0_-2px_0_0_#3b82f6]' : 'text-term-muted'
                }`
              }
            >
              {n.label}
            </NavLink>
          ))}
        </nav>
      </header>

      <main className="md:pl-52">
        <div className="mx-auto max-w-6xl p-4 md:p-6">
          <MarketStatusBar />
          <Outlet context={{ tick }} />
        </div>
        <footer className="mx-auto max-w-6xl px-4 pb-6 md:px-6">
          <div className="rounded-md border border-term-border bg-term-panel px-4 py-3 text-xs leading-5 text-term-muted">
            {isSimulated ? (
              <>
                当前为<strong className="text-amber-400">本地模拟备用行情</strong>，由程序生成，与真实市场无关。
              </>
            ) : (
              <>
                当前行情来自 <strong className="text-term-up">Alpaca Market Data API 的 IEX 实时数据</strong>，
                仅为单一交易所数据，<strong>不是全市场 SIP 行情</strong>；历史 K 线与最新成交也均使用 IEX 源。
              </>
            )}
            {' '}所有交易均为虚拟资金模拟，不构成任何投资建议，也不涉及真实下单。
          </div>
        </footer>
      </main>
    </div>
  )
}
