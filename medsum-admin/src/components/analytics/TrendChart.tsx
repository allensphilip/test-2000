import { useMemo, useRef, useState, useEffect } from 'react'

type Point = { x: number; y: number }

const toPath = (pts: Point[]) => {
  if (!pts.length) return ""
  return pts.map((p, i) => (i === 0 ? `M ${p.x} ${p.y}` : `L ${p.x} ${p.y}`)).join(" ")
}

export const TrendChart = ({ points }: { points: { v: number; ts: string }[] }) => {
  const [dimensions, setDimensions] = useState({ w: 600, h: 220 })
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const updateSize = () => {
      if (containerRef.current) {
        const width = containerRef.current.offsetWidth
        setDimensions({ w: Math.max(400, width - 20), h: 220 })
      }
    }
    updateSize()
    window.addEventListener('resize', updateSize)
    return () => window.removeEventListener('resize', updateSize)
  }, [])

  const { w, h } = dimensions
  const pad = 40
  const values = points.map(p => p.v)
  const max = Math.max(0, ...values)
  const min = Math.min(0, ...values)
  const sx = (i: number) => pad + (i * (w - 2 * pad)) / Math.max(1, values.length - 1)
  const sy = (v: number) => h - pad - ((v - min) / Math.max(1, max - min)) * (h - 2 * pad)
  const pts = useMemo(() => values.map((v, i) => ({ x: sx(i), y: sy(v) })), [values, min, max])
  const ticks = useMemo(() => {
    const range = max - min
    const t1 = min
    const t2 = min + range * 0.33
    const t3 = min + range * 0.66
    const t4 = max
    return [t1, t2, t3, t4]
  }, [min, max])
  const [hover, setHover] = useState<number | null>(null)
  const svgRef = useRef<SVGSVGElement | null>(null)
  const handleMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const box = svgRef.current?.getBoundingClientRect()
    if (!box) return
    const x = e.clientX - box.left
    let nearest = 0
    let best = Infinity
    pts.forEach((p, i) => {
      const d = Math.abs(p.x - x)
      if (d < best) { best = d; nearest = i }
    })
    setHover(nearest)
  }
  const handleLeave = () => setHover(null)

  if (values.length === 0) {
    return <div style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8', fontSize: '0.875rem' }}>No data available</div>
  }

  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <svg ref={svgRef} width={w} height={h} onMouseMove={handleMove} onMouseLeave={handleLeave} style={{ display: 'block', margin: '0 auto' }}>
      <defs>
        <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#2563eb" stopOpacity="0.25" />
          <stop offset="100%" stopColor="#2563eb" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${toPath(pts)} L ${w-pad} ${h-pad} L ${pad} ${h-pad} Z`} fill="url(#trendFill)" stroke="none" />
      <line x1={pad} y1={h - pad} x2={w - pad} y2={h - pad} stroke="#cbd5e1" strokeWidth={1} />
      <line x1={pad} y1={pad} x2={pad} y2={h - pad} stroke="#cbd5e1" strokeWidth={1} />
      {ticks.map((t, i) => (
        <g key={i}>
          <line x1={pad} y1={sy(t)} x2={w - pad} y2={sy(t)} stroke="#e2e8f0" strokeWidth={1} />
          <text x={pad - 8} y={sy(t)} fill="#334155" fontSize={12} textAnchor="end" dominantBaseline="central">{t.toFixed(3)}</text>
        </g>
      ))}
      <path d={toPath(pts)} fill="none" stroke="#2563eb" strokeWidth={2.5} />
      {pts.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={hover===i?5:3.5} fill="#2563eb" stroke="white" strokeWidth={1.5} />
      ))}
      <text x={w / 2} y={h - 8} fill="#64748b" fontSize={11} textAnchor="middle">Last {values.length} transcriptions</text>
      <text x={-h / 2} y={18} fill="#64748b" fontSize={11} textAnchor="middle" transform={`rotate(-90)`}>WER Score</text>
      {hover!=null && (
        <g>
          <rect x={pts[hover].x - 90} y={pts[hover].y - 50} width={180} height={42} rx={8} fill="#0f172a" opacity={0.96} />
          <text x={pts[hover].x} y={pts[hover].y - 30} fill="#fff" fontSize={12} fontWeight={600} textAnchor="middle">WER: {values[hover].toFixed(4)}</text>
          <text x={pts[hover].x} y={pts[hover].y - 14} fill="#cbd5e1" fontSize={10} textAnchor="middle">{new Date(points[hover].ts).toLocaleDateString()} {new Date(points[hover].ts).toLocaleTimeString()}</text>
        </g>
      )}
    </svg>
    </div>
  )
}
