import { useMemo } from 'react'
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { PricePoint, RangeKey } from '../types'
import { fmtDateShort, fmtTimeShort, fmtUSD } from '../utils/format'

interface Props {
  data: PricePoint[]
  range: RangeKey
  height?: number
  /** Tooltip 中显示的数据来源标签 */
  valueLabel?: string
}

function formatTick(t: number, range: RangeKey): string {
  if (range === '1D') return fmtTimeShort(t)
  if (range === '1Y') {
    const d = new Date(t)
    return `${d.getFullYear()}/${d.getMonth() + 1}`
  }
  return fmtDateShort(t)
}

/** 价格走势图（Recharts 面积图，随行情 tick 自动刷新） */
export default function PriceChart({ data, range, height = 320, valueLabel = '价格' }: Props) {
  const { up, domainMin, domainMax } = useMemo(() => {
    if (data.length === 0) return { up: true, domainMin: 0, domainMax: 1 }
    const prices = data.map((p) => p.price)
    const min = Math.min(...prices)
    const max = Math.max(...prices)
    const pad = (max - min || max * 0.01 || 1) * 0.08
    return {
      up: data[data.length - 1].price >= data[0].price,
      domainMin: Math.max(0, min - pad),
      domainMax: max + pad,
    }
  }, [data])

  const color = up ? '#16c784' : '#ea3943'

  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
          <defs>
            <linearGradient id="priceFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.25} />
              <stop offset="100%" stopColor={color} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="#232a35" strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="t"
            tickFormatter={(t: number) => formatTick(t, range)}
            stroke="#7d8694"
            fontSize={11}
            tickLine={false}
            axisLine={{ stroke: '#232a35' }}
            minTickGap={48}
          />
          <YAxis
            domain={[domainMin, domainMax]}
            tickFormatter={(v: number) => `$${v.toFixed(2)}`}
            stroke="#7d8694"
            fontSize={11}
            tickLine={false}
            axisLine={false}
            width={76}
            orientation="right"
          />
          <Tooltip
            contentStyle={{
              background: '#171c25',
              border: '1px solid #232a35',
              borderRadius: 6,
              fontSize: 12,
            }}
            labelStyle={{ color: '#7d8694' }}
            labelFormatter={(t) => new Date(Number(t)).toLocaleString('zh-CN')}
            formatter={(value) => [fmtUSD(Number(value)), valueLabel]}
          />
          <Area
            type="monotone"
            dataKey="price"
            stroke={color}
            strokeWidth={1.6}
            fill="url(#priceFill)"
            isAnimationActive={false}
            dot={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
