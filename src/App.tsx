import { lazy, Suspense } from 'react'
import { HashRouter, Route, Routes } from 'react-router-dom'
import { MarketProvider } from './market/MarketContext'
import { AccountProvider } from './store/AccountContext'
import Layout from './components/Layout'

const MarketPage = lazy(() => import('./pages/MarketPage'))
const StockDetailPage = lazy(() => import('./pages/StockDetailPage'))
const PortfolioPage = lazy(() => import('./pages/PortfolioPage'))
const TradesPage = lazy(() => import('./pages/TradesPage'))

export default function App() {
  return (
    <MarketProvider>
      <AccountProvider>
        <HashRouter>
          <Suspense fallback={<div className="p-8 text-center text-sm text-term-muted">页面加载中…</div>}>
            <Routes>
              <Route element={<Layout />}>
                <Route index element={<MarketPage />} />
                <Route path="stock/:symbol" element={<StockDetailPage />} />
                <Route path="portfolio" element={<PortfolioPage />} />
                <Route path="trades" element={<TradesPage />} />
                <Route path="*" element={<MarketPage />} />
              </Route>
            </Routes>
          </Suspense>
        </HashRouter>
      </AccountProvider>
    </MarketProvider>
  )
}
