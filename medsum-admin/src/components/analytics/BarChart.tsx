import { useMemo, useState } from 'react'

export const BarChart = ({ labels, values, counts, color = '#10b981', maxWidth = 400, sort = 'none', showAxis = false }: { labels: string[]; values: number[]; counts?: number[]; color?: string; maxWidth?: number; sort?: 'none'|'asc'|'desc'; showAxis?: boolean }) => {
  const [hover, setHover] = useState<number | null>(null)
  const data = useMemo(() => {
    const rows = labels.map((l, i) => ({ l, v: values[i] ?? 0, c: counts ? counts[i] ?? 0 : undefined }))
    if (sort === 'asc') rows.sort((a,b)=> a.v - b.v)
    if (sort === 'desc') rows.sort((a,b)=> b.v - a.v)
    return rows
  }, [labels, values, counts, sort])
  const max = Math.max(1, ...data.map(d=>d.v))
  const widthFor = (v: number) => `${(v / max) * maxWidth}px`
  return (
    <div style={{ display: 'grid', gap: 4 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingBottom: 4, borderBottom: '1px solid #e2e8f0' }}>
        <div style={{ width: 10, height: 10, background: color, borderRadius: 2 }} />
        <div style={{ fontSize: 13, color: '#475569', fontWeight: 500 }}>Avg WER (lower is better)</div>
      </div>
      {showAxis && (
        <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom: 2 }}>
          <div style={{ width: 180 }} />
          <div style={{ position:'relative', width: maxWidth, height: 24 }}>
            <div style={{ position:'absolute', left:0, top:0, width:1, height:6, background:'#cbd5e1' }} />
            <div style={{ position:'absolute', left: maxWidth/2, top:0, width:1, height:6, background:'#cbd5e1' }} />
            <div style={{ position:'absolute', left: maxWidth-1, top:0, width:1, height:6, background:'#cbd5e1' }} />
            <div style={{ position:'absolute', left:0, top:8, fontSize:11, color:'#64748b', fontWeight: 500 }}>0.000</div>
            <div style={{ position:'absolute', left: maxWidth/2-20, top:8, fontSize:11, color:'#64748b', fontWeight: 500 }}>{(max/2).toFixed(3)}</div>
            <div style={{ position:'absolute', left: maxWidth-40, top:8, fontSize:11, color:'#64748b', fontWeight: 500 }}>{max.toFixed(3)}</div>
          </div>
          <div style={{ width: 80 }} />
        </div>
      )}
      {data.map((d, i) => {
        const gridLines = [0.25, 0.5, 0.75].map(pct => pct * maxWidth)
        return (
        <div key={i} style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 8, paddingTop: 2, paddingBottom: 2, borderBottom: i < data.length - 1 ? '1px solid #f1f5f9' : 'none' }}>
          <div style={{ width: 180, fontSize: 13, color: '#1e293b', fontWeight: 500 }}>{d.l}</div>
          <div style={{ position: 'relative', width: maxWidth }}>
            {showAxis && gridLines.map((x, idx) => (
              <div key={idx} style={{ position: 'absolute', left: x, top: -4, bottom: -4, width: 1, background: '#f1f5f9', zIndex: 0 }} />
            ))}
            <div
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              style={{ position: 'relative', zIndex: 1, background: hover === i ? '#818cf8' : color, height: 18, width: widthFor(d.v), borderRadius: 6, boxShadow: hover === i ? '0 3px 10px rgba(99, 102, 241, 0.4)' : '0 1px 3px rgba(0,0,0,0.1)', transition: 'all 0.2s ease', cursor: 'pointer' }}
            />
          </div>
          <div style={{ width: 80, textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontSize: 13, fontWeight: 600, color: '#0f172a' }}>{d.v.toFixed(4)}</div>
          {hover === i && (
            <div style={{ position: 'absolute', left: 200, top: -45, background: '#0f172a', color: '#fff', padding: '10px 14px', borderRadius: 8, fontSize: 12, boxShadow: '0 10px 32px rgba(2,8,23,0.4)', zIndex: 20 }}>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>{d.l}</div>
              <div style={{ color: '#cbd5e1' }}>Avg WER: {d.v.toFixed(4)}{typeof d.c === 'number' ? ` · ${d.c} summaries` : ''}</div>
            </div>
          )}
        </div>
      )})}
    </div>
  )
}
