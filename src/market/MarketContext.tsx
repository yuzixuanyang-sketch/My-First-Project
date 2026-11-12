/* oxlint-disable react/only-export-components -- Provider 与同模块 Hook 是内聚的公开 API */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from 'react'
import { marketProvider } from './provider'
import type { MarketMode, MarketStatus, Quote } from '../types'

interface MarketContextValue {
  /** 当前全部报价快照（真实 IEX 或本地模拟） */
  quotes: Map<string, Quote>
  /** 行情版本号，每次数据或状态变化递增 */
  tick: number
  isSimulated: boolean
  mode: MarketMode
  status: MarketStatus
  /** 最新数据源更新时间；真实模式为 IEX 事件时间 */
  lastUpdated: number | null
  setMode: (mode: MarketMode) => void
  retry: () => void
}

const MarketContext = createContext<MarketContextValue | null>(null)

export function MarketProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    marketProvider.start()
    return () => marketProvider.stop()
  }, [])

  const version = useSyncExternalStore(
    (callback) => marketProvider.subscribe(callback),
    () => marketProvider.getVersion(),
  )

  const setMode = useCallback((mode: MarketMode) => {
    marketProvider.setMode(mode)
  }, [])

  const retry = useCallback(() => {
    marketProvider.retry()
  }, [])

  const value = useMemo<MarketContextValue>(() => {
    const quotes = new Map(
      marketProvider.getQuotes().map((quote) => [quote.symbol, { ...quote }]),
    )
    const quoteUpdatedAt = [...quotes.values()].reduce((latest, quote) => {
      return quote.updatedAt && quote.updatedAt > latest ? quote.updatedAt : latest
    }, 0)
    const status = marketProvider.getStatus()
    return {
      quotes,
      tick: version,
      isSimulated: marketProvider.isSimulated,
      mode: marketProvider.getMode(),
      status,
      lastUpdated: quoteUpdatedAt || status.updatedAt,
      setMode,
      retry,
    }
  }, [version, setMode, retry])

  return <MarketContext.Provider value={value}>{children}</MarketContext.Provider>
}

export function useMarket(): MarketContextValue {
  const context = useContext(MarketContext)
  if (!context) throw new Error('useMarket must be used within MarketProvider')
  return context
}
