import type { Quote } from '../types'

/** 初始虚拟资金（美元） */
export const INITIAL_CASH = 100_000

export interface Position {
  symbol: string
  qty: number
  /** 平均持仓成本（美元/股，买入加权平均） */
  avgCost: number
}

export interface Trade {
  id: string
  symbol: string
  name: string
  side: 'BUY' | 'SELL'
  price: number
  qty: number
  amount: number
  time: number
}

export interface AccountState {
  cash: number
  positions: Record<string, Position>
  trades: Trade[]
  /** 累计已实现盈亏（卖出时结算） */
  realizedPnl: number
}

export function createInitialAccount(): AccountState {
  return { cash: INITIAL_CASH, positions: {}, trades: [], realizedPnl: 0 }
}

export interface TradeResult {
  ok: boolean
  error?: string
  state?: AccountState
}

/** 买入：校验资金，更新现金与加权平均成本 */
export function applyBuy(
  state: AccountState,
  symbol: string,
  name: string,
  price: number,
  qty: number,
): TradeResult {
  if (!Number.isFinite(price) || price <= 0) return { ok: false, error: '成交价格无效' }
  if (!Number.isInteger(qty) || qty <= 0) return { ok: false, error: '数量必须为正整数' }
  const amount = price * qty
  if (amount > state.cash + 1e-9) {
    return { ok: false, error: '可用资金不足，无法完成买入' }
  }
  const prev = state.positions[symbol]
  const newQty = (prev?.qty ?? 0) + qty
  const newAvg = prev ? (prev.avgCost * prev.qty + amount) / newQty : price
  const trade: Trade = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    symbol,
    name,
    side: 'BUY',
    price,
    qty,
    amount,
    time: Date.now(),
  }
  return {
    ok: true,
    state: {
      ...state,
      cash: state.cash - amount,
      positions: {
        ...state.positions,
        [symbol]: { symbol, qty: newQty, avgCost: newAvg },
      },
      trades: [trade, ...state.trades],
    },
  }
}

/** 卖出：校验持仓，结算已实现盈亏 */
export function applySell(
  state: AccountState,
  symbol: string,
  name: string,
  price: number,
  qty: number,
): TradeResult {
  if (!Number.isFinite(price) || price <= 0) return { ok: false, error: '成交价格无效' }
  if (!Number.isInteger(qty) || qty <= 0) return { ok: false, error: '数量必须为正整数' }
  const prev = state.positions[symbol]
  if (!prev || prev.qty < qty) {
    return { ok: false, error: '持仓数量不足，无法完成卖出' }
  }
  const amount = price * qty
  const realized = (price - prev.avgCost) * qty
  const remain = prev.qty - qty
  const positions = { ...state.positions }
  if (remain === 0) delete positions[symbol]
  else positions[symbol] = { ...prev, qty: remain }

  const trade: Trade = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    symbol,
    name,
    side: 'SELL',
    price,
    qty,
    amount,
    time: Date.now(),
  }
  return {
    ok: true,
    state: {
      ...state,
      cash: state.cash + amount,
      positions,
      trades: [trade, ...state.trades],
      realizedPnl: state.realizedPnl + realized,
    },
  }
}

export interface PositionView extends Position {
  name: string
  price: number
  marketValue: number
  unrealizedPnl: number
  unrealizedPct: number
}

export interface PortfolioSummary {
  cash: number
  marketValue: number
  totalAssets: number
  realizedPnl: number
  unrealizedPnl: number
  totalPnl: number
  totalReturnPct: number
  positions: PositionView[]
}

/** 基于当前报价计算账户全景（含未实现盈亏） */
export function summarize(
  state: AccountState,
  quotes: Map<string, Quote>,
  nameOf: (symbol: string) => string,
): PortfolioSummary {
  const positions: PositionView[] = Object.values(state.positions).map((p) => {
    const price = quotes.get(p.symbol)?.price ?? p.avgCost
    const marketValue = price * p.qty
    const unrealizedPnl = (price - p.avgCost) * p.qty
    return {
      ...p,
      name: nameOf(p.symbol),
      price,
      marketValue,
      unrealizedPnl,
      unrealizedPct: p.avgCost > 0 ? (price - p.avgCost) / p.avgCost : 0,
    }
  })
  const marketValue = positions.reduce((s, p) => s + p.marketValue, 0)
  const unrealizedPnl = positions.reduce((s, p) => s + p.unrealizedPnl, 0)
  const totalAssets = state.cash + marketValue
  const totalPnl = totalAssets - INITIAL_CASH
  return {
    cash: state.cash,
    marketValue,
    totalAssets,
    realizedPnl: state.realizedPnl,
    unrealizedPnl,
    totalPnl,
    totalReturnPct: totalPnl / INITIAL_CASH,
    positions,
  }
}
