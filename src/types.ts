/** 股票静态信息 */
export interface StockMeta {
  symbol: string
  name: string
  /** 基准价格（本地模拟模式起始价，美元） */
  basePrice: number
  /** 年化波动率（仅本地模拟模式使用） */
  volatility: number
}

/** 当前报价。真实模式来自 Alpaca IEX，本地模式来自模拟引擎 */
export interface Quote {
  symbol: string
  price: number
  prevClose: number
  open: number
  high: number
  low: number
  volume: number
  /** IEX 买一价 */
  bid?: number | null
  /** IEX 卖一价 */
  ask?: number | null
  bidSize?: number | null
  askSize?: number | null
  /** 最近成交所在交易所代码 */
  exchange?: string | null
  lastTradeSize?: number | null
  lastTradeAt?: number | null
  /** 数据源时间戳（ms） */
  updatedAt?: number | null
  source?: string
}

/** K 线（日） */
export interface DailyBar {
  t: number // 时间戳 ms
  o: number
  h: number
  l: number
  c: number
  v: number
}

/** 图表数据点 */
export interface PricePoint {
  t: number
  price: number
}

export type RangeKey = '1D' | '1W' | '1M' | '3M' | '1Y'

export const RANGES: { key: RangeKey; label: string }[] = [
  { key: '1D', label: '1日' },
  { key: '1W', label: '1周' },
  { key: '1M', label: '1月' },
  { key: '3M', label: '3月' },
  { key: '1Y', label: '1年' },
]

export type MarketMode = 'real' | 'simulation'

export interface MarketSource {
  provider: 'Alpaca' | 'Local Simulator'
  feed: 'IEX' | 'SIMULATION'
  isSimulated: boolean
  description: string
}

export type MarketConnectionState =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'error'
  | 'unavailable'

export interface MarketStatus {
  state: MarketConnectionState
  code: string | null
  message: string
  source: MarketSource
  updatedAt: number | null
  nextRetryAt: number | null
}
