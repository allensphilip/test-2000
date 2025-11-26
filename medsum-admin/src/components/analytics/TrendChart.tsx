type Point = { x: number; y: number }

const toPath = (pts: Point[]) => {
  if (!pts.length) return ""
  return pts.map((p, i) => (i === 0 ? `M ${p.x} ${p.y}` : `L ${p.x} ${p.y}`)).join(" ")
}

export const TrendChart = ({ values }: { values: number[] }) => {
  const w = 600, h = 180, pad = 12
  const max = Math.max(0, ...values)
  const min = Math.min(0, ...values)
  const scaleX = (i: number) => pad + (i * (w - 2 * pad)) / Math.max(1, values.length - 1)
  const scaleY = (v: number) => h - pad - ((v - min) / Math.max(1, max - min)) * (h - 2 * pad)
  const pts = values.map((v, i) => ({ x: scaleX(i), y: scaleY(v) }))
  return (
    <svg width={w} height={h}>
      <path d={toPath(pts)} fill="none" stroke="#2563eb" strokeWidth={2} />
    </svg>
  )
}
