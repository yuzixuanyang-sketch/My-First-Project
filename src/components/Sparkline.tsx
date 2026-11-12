interface Props {
  data: number[]
  width?: number
  height?: number
  up: boolean
}

/** 首页迷你走势图（纯 SVG，无依赖） */
export default function Sparkline({ data, width = 96, height = 32, up }: Props) {
  if (data.length < 2) return <div style={{ width, height }} />
  const min = Math.min(...data)
  const max = Math.max(...data)
  const span = max - min || 1
  const step = width / (data.length - 1)
  const points = data
    .map((v, i) => `${(i * step).toFixed(1)},${(height - 2 - ((v - min) / span) * (height - 4)).toFixed(1)}`)
    .join(' ')
  const color = up ? '#16c784' : '#ea3943'
  return (
    <svg width={width} height={height} className="shrink-0">
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.5" />
    </svg>
  )
}
