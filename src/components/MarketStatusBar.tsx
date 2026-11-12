import { useMarket } from '../market/MarketContext'
import { fmtTime } from '../utils/format'
import type { MarketConnectionState, MarketSource } from '../types'

const STATE_TEXT: Record<MarketConnectionState, string> = {
  idle: '已停止',
  connecting: '连接中',
  connected: '已连接',
  reconnecting: '重连中',
  error: '连接失败',
  unavailable: '数据不可用',
}

function dotClass(state: MarketConnectionState): string {
  if (state === 'connected') return 'bg-term-up'
  if (state === 'connecting' || state === 'reconnecting') return 'bg-amber-400'
  if (state === 'idle') return 'bg-term-muted'
  return 'bg-term-down'
}

function borderClass(state: MarketConnectionState): string {
  if (state === 'connected') return 'border-term-border'
  if (state === 'connecting' || state === 'reconnecting') return 'border-amber-500/40'
  return 'border-term-down/50'
}

function sourceBadgeClass(source: MarketSource): string {
  return source.isSimulated
    ? 'border-amber-500/40 bg-amber-500/10 text-amber-400'
    : 'border-term-up/40 bg-term-up/10 text-term-up'
}

/** 页面顶部的数据来源、连接状态和模式切换条 */
export default function MarketStatusBar() {
  const { mode, status, lastUpdated, setMode, retry } = useMarket()
  const hasProblem =
    status.state === 'error' ||
    status.state === 'unavailable' ||
    status.state === 'reconnecting'

  return (
    <section
      aria-label="行情数据状态"
      className={`mb-4 rounded-lg border bg-term-panel px-4 py-3 ${borderClass(status.state)}`}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`h-2 w-2 shrink-0 rounded-full ${dotClass(status.state)}`} />
          <span className="text-sm font-medium text-white">
            {status.source.provider === 'Alpaca' ? 'Alpaca IEX 实时行情' : '本地模拟备用行情'}
          </span>
          <span
            className={`shrink-0 rounded border px-1.5 py-0.5 text-[11px] ${sourceBadgeClass(status.source)}`}
          >
            {status.source.isSimulated ? '非真实市场报价' : 'IEX · 非 SIP 全市场'}
          </span>
          <span className="text-xs text-term-muted">{STATE_TEXT[status.state]}</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {mode === 'real' && hasProblem && (
            <button
              onClick={retry}
              className="rounded-md border border-term-border px-2.5 py-1 text-xs text-term-text hover:bg-term-panel2"
            >
              重试连接
            </button>
          )}
          <div className="rounded-md border border-term-border bg-term-bg p-0.5" role="group" aria-label="行情模式">
            <button
              onClick={() => setMode('real')}
              aria-pressed={mode === 'real'}
              className={`rounded px-2.5 py-1 text-xs ${
                mode === 'real' ? 'bg-term-accent/25 text-white' : 'text-term-muted hover:text-term-text'
              }`}
            >
              IEX 实时
            </button>
            <button
              onClick={() => setMode('simulation')}
              aria-pressed={mode === 'simulation'}
              className={`rounded px-2.5 py-1 text-xs ${
                mode === 'simulation' ? 'bg-amber-500/25 text-amber-300' : 'text-term-muted hover:text-term-text'
              }`}
            >
              模拟备用
            </button>
          </div>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-term-muted">
        <span>更新时间：{lastUpdated ? fmtTime(lastUpdated) : '暂无'}</span>
        <span>{status.message}</span>
        {status.code && <span className="num">代码 {status.code}</span>}
      </div>
    </section>
  )
}

/** 侧边栏/移动端使用的紧凑来源标识 */
export function MarketSourceBadge() {
  const { mode, status } = useMarket()
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded border px-2 py-0.5 text-xs ${sourceBadgeClass(status.source)}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${dotClass(status.state)}`} />
      {mode === 'real' ? 'Alpaca IEX · 非 SIP' : '模拟行情 · 非真实报价'}
    </span>
  )
}
