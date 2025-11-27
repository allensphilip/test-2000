import { useEffect, useState } from 'react'
import { BarChart } from './BarChart'

type SummaryRow = { file_name: string; wer: number }

export default function PairsChart() {
  const [labels, setLabels] = useState<string[]>([])
  const [values, setValues] = useState<number[]>([])
  const [counts, setCounts] = useState<number[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const run = async () => {
      try {
        const res = await fetch('/api/analytics/summary/list', { cache: 'no-store' })
        if (!res.ok) { setLoading(false); return }
        const list = (await res.json()) as SummaryRow[]
        const take = list.slice(0, 100)
        const texts = await Promise.all(take.map(r => fetch(`/api/analytics/summary/${encodeURIComponent(r.file_name)}`, { cache: 'no-store' }).then(x => x.text()).catch(()=>'')))
        const rows = texts.map(t => { try { return t ? JSON.parse(t) : null } catch { return null } }).filter(Boolean)
        const map = new Map<string, number[]>()
        rows.forEach((j: any) => {
          const mid = j?.metadata?.model_id
          const pid = j?.metadata?.prompt_id
          const wer = j?.wer
          if (!mid || pid == null || typeof wer !== 'number') return
          const key = `${mid} · prompt ${pid}`
          if (!map.has(key)) map.set(key, [])
          map.get(key)!.push(wer)
        })
        const pairs = Array.from(map.entries()).map(([k, arr]) => ({ k, avg: arr.reduce((a,b)=>a+b,0)/arr.length, n: arr.length }))
        pairs.sort((a,b)=> a.avg - b.avg)
        const top6 = pairs.slice(0, 6)
        setLabels(top6.map(p => p.k))
        setValues(top6.map(p => p.avg))
        setCounts(top6.map(p => p.n))
      } finally { setLoading(false) }
    }
    run()
  }, [])

  if (loading) return <div style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8', fontSize: '0.875rem' }}>Loading model/prompt pairs...</div>
  if (labels.length === 0) return <div style={{ border: '2px dashed #e2e8f0', borderRadius: 12, padding: '2rem', color: '#94a3b8', textAlign: 'center', fontSize: '0.875rem' }}>No model/prompt pairs available</div>
  return (
    <div style={{ height: '100%' }}>
      <BarChart labels={labels} values={values} counts={counts} color="#6366f1" maxWidth={400} sort="none" showAxis />
    </div>
  )
}

