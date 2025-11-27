import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '@/components/ui/select'
import { BarChart } from './BarChart'
import { CorrectionsTable } from './CorrectionsTable'
import { fetchSummaryList, fetchTranscriptionList } from '@/lib/analytics-api'

import type { SummaryRow, TranscriptionRow } from '@/lib/analytics-api'

type Detail = { file_name: string; wer: number; cer: number; bleu: number; prompt_id?: number; model_id?: string; client_id?: number; job_id?: string }

const fetchSummaryDetail = async (file: string): Promise<Detail | null> => {
  try {
    const res = await fetch(`/api/analytics/summary/${encodeURIComponent(file)}`, { cache: 'no-store' })
    if (!res.ok) return null
    const txt = await res.text()
    const j = txt ? JSON.parse(txt) : null
    if (!j) return null
    return {
      file_name: file,
      wer: j.wer,
      cer: j.cer,
      bleu: j.bleu,
      prompt_id: j.metadata?.prompt_id,
      model_id: j.metadata?.model_id,
      client_id: j.metadata?.client_id,
      job_id: j.metadata?.job_id,
    }
  } catch {
    return null
  }
}

export default function AnalyticsTabs() {
  const [tab, setTab] = useState<'overview'|'prompts'|'models'|'clients'|'corrections'>('prompts')
  const [summary, setSummary] = useState<SummaryRow[]>([])
  const [transcripts, setTranscripts] = useState<TranscriptionRow[]>([])
  const [details, setDetails] = useState<Detail[]>([])
  const [loading, setLoading] = useState(false)
  const [job, setJob] = useState('')
  const [corrections, setCorrections] = useState<{index:number;before:string;after:string}[]>([])
  const [jobTranscription, setJobTranscription] = useState<{wer:number;cer:number;bleu:number}|null>(null)
  const [jobSummary, setJobSummary] = useState<{wer:number;cer:number;bleu:number}|null>(null)
  const [globalQuery, setGlobalQuery] = useState('')
  const [globalType, setGlobalType] = useState<'transcription'|'summary'>('summary')
  const [jobQuery, setJobQuery] = useState('')
  const loadCorrectionsFor = async (file: string) => {
    if (!file) return
    try {
      const res = await fetch(`/api/analytics/transcription/${encodeURIComponent(file)}/corrections`, { cache: 'no-store' })
      if (!res.ok) { setCorrections([]); return }
      const txt = await res.text()
      let json: any = []
      try { json = txt ? JSON.parse(txt) : [] } catch { json = [] }
      setCorrections(Array.isArray(json) ? json : [])
    } catch { setCorrections([]) }
    const t = transcripts.find(x => x.file_name === file)
    setJobTranscription(t ? { wer: t.wer, cer: t.cer, bleu: t.bleu } : null)
    const s = details.find(x => x.job_id === file)
    setJobSummary(s ? { wer: s.wer, cer: s.cer, bleu: s.bleu } : null)
  }

  useEffect(() => {
    const run = async () => {
      setLoading(true)
      const [sum, tr] = await Promise.all([fetchSummaryList(), fetchTranscriptionList()])
      setSummary(sum)
      setTranscripts(tr)
      const files = sum.map(r => r.file_name).slice(0, 100)
      const batch = await Promise.all(files.map(f => fetchSummaryDetail(f)))
      setDetails(batch.filter(Boolean) as Detail[])
      setLoading(false)
    }
    run()
  }, [])

  useEffect(() => {
    const handler = (e: any) => {
      const d = e?.detail || {}
      if (typeof d.q === 'string') setGlobalQuery(d.q)
      if (d.type === 'transcription' || d.type === 'summary') setGlobalType(d.type)
    }
    window.addEventListener('analyticsFilterChange', handler)
    return () => window.removeEventListener('analyticsFilterChange', handler)
  }, [])

  const promptAgg = useMemo(() => {
    const map = new Map<number, number[]>()
    const filtered = details.filter(d => {
      const q = globalQuery.toLowerCase()
      return !globalQuery || d.file_name.toLowerCase().includes(q) || (d.job_id?.toLowerCase?.().includes(q))
    })
    filtered.forEach(d => {
      if (d.prompt_id != null) {
        if (!map.has(d.prompt_id)) map.set(d.prompt_id, [])
        map.get(d.prompt_id)!.push(d.wer)
      }
    })
    const labels: string[] = []
    const values: number[] = []
    const counts: number[] = []
    Array.from(map.entries()).sort((a,b)=> (a[0]-b[0])).forEach(([pid, arr]) => {
      const avg = arr.reduce((a,b)=>a+b,0)/arr.length
      labels.push(String(pid))
      values.push(avg)
      counts.push(arr.length)
    })
    return { labels, values, counts }
  }, [details, globalQuery])

  const modelAgg = useMemo(() => {
    const map = new Map<string, number[]>()
    const filtered = details.filter(d => {
      const q = globalQuery.toLowerCase()
      return !globalQuery || d.file_name.toLowerCase().includes(q) || (d.job_id?.toLowerCase?.().includes(q))
    })
    filtered.forEach(d => {
      if (d.model_id) {
        if (!map.has(d.model_id)) map.set(d.model_id, [])
        map.get(d.model_id)!.push(d.wer)
      }
    })
    const labels: string[] = []
    const values: number[] = []
    const counts: number[] = []
    Array.from(map.entries()).sort((a,b)=> a[0].localeCompare(b[0])).forEach(([mid, arr]) => {
      const avg = arr.reduce((a,b)=>a+b,0)/arr.length
      labels.push(mid)
      values.push(avg)
      counts.push(arr.length)
    })
    return { labels, values, counts }
  }, [details, globalQuery])

  const clientAgg = useMemo(() => {
    const map = new Map<number, number[]>()
    const filtered = details.filter(d => {
      const q = globalQuery.toLowerCase()
      return !globalQuery || d.file_name.toLowerCase().includes(q) || (d.job_id?.toLowerCase?.().includes(q))
    })
    filtered.forEach(d => {
      if (d.client_id != null) {
        if (!map.has(d.client_id)) map.set(d.client_id, [])
        map.get(d.client_id)!.push(d.wer)
      }
    })
    const labels: string[] = []
    const values: number[] = []
    const counts: number[] = []
    Array.from(map.entries()).sort((a,b)=> (a[0]-b[0])).forEach(([cid, arr]) => {
      const avg = arr.reduce((a,b)=>a+b,0)/arr.length
      labels.push(String(cid))
      values.push(avg)
      counts.push(arr.length)
    })
    return { labels, values, counts }
  }, [details, globalQuery])

  const pairAgg = useMemo(() => {
    const map = new Map<string, number[]>()
    const filtered = details.filter(d => {
      const q = globalQuery.toLowerCase()
      return (!globalQuery || d.file_name.toLowerCase().includes(q) || (d.job_id?.toLowerCase?.().includes(q))) && d.prompt_id != null && !!d.model_id
    })
    filtered.forEach(d => {
      const key = `${d.model_id} · prompt ${d.prompt_id}`
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(d.wer)
    })
    const labels: string[] = []
    const values: number[] = []
    const counts: number[] = []
    Array.from(map.entries()).sort((a,b)=> a[0].localeCompare(b[0])).forEach(([k, arr]) => {
      const avg = arr.reduce((a,b)=>a+b,0)/arr.length
      labels.push(k)
      values.push(avg)
      counts.push(arr.length)
    })
    return { labels, values, counts }
  }, [details, globalQuery])

  const loadCorrections = async () => {
    if (!job) return
    try {
      const res = await fetch(`/api/analytics/transcription/${encodeURIComponent(job)}/corrections`, { cache: 'no-store' })
      if (!res.ok) { setCorrections([]); return }
      setCorrections(await res.json())
    } catch { setCorrections([]) }

    const t = transcripts.find(x => x.file_name === job)
    setJobTranscription(t ? { wer: t.wer, cer: t.cer, bleu: t.bleu } : null)
    const s = details.find(x => x.job_id === job)
    setJobSummary(s ? { wer: s.wer, cer: s.cer, bleu: s.bleu } : null)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
      <div style={{ flexShrink: 0, display: 'flex', gap: 8, paddingBottom: 12, borderBottom: '1px solid #e2e8f0' }}>
        {(['prompts','models','clients','pairs','corrections'] as const).map(t => (
          <Button key={t} variant={tab===t? 'default':'ghost'} onClick={()=>setTab(t)}>{t[0].toUpperCase()+t.slice(1)}</Button>
        ))}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', paddingTop: 16 }}>
        {loading && <div style={{ padding: 12, fontSize: '0.875rem' }}>Loading analytics…</div>}

        {!loading && tab==='prompts' && (
          <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 10, padding: '0.75rem', boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)' }}>
            <h3 style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: '0.75rem', color: '#1e293b' }}>Best Prompts (Avg WER)</h3>
            {globalType === 'summary' ? (
              <div>
                <BarChart labels={promptAgg.labels} values={promptAgg.values} counts={promptAgg.counts} color="#0ea5e9" showAxis />
              </div>
            ) : (
              <div style={{ border: '2px dashed #e2e8f0', borderRadius: 10, padding: '1.5rem', color: '#94a3b8', textAlign: 'center', fontSize: '0.8rem' }}>Aggregations require summary metadata. Switch dataset to "Summary".</div>
            )}
          </div>
        )}

        {!loading && tab==='models' && (
          <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 10, padding: '0.75rem', boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)' }}>
            <h3 style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: '0.75rem', color: '#1e293b' }}>Model Performance (Avg WER)</h3>
            {globalType === 'summary' ? (
              <div>
                <BarChart labels={modelAgg.labels} values={modelAgg.values} counts={modelAgg.counts} color="#22c55e" showAxis />
              </div>
            ) : (
              <div style={{ border: '2px dashed #e2e8f0', borderRadius: 10, padding: '1.5rem', color: '#94a3b8', textAlign: 'center', fontSize: '0.8rem' }}>Aggregations require summary metadata. Switch dataset to "Summary".</div>
            )}
          </div>
        )}

        {!loading && tab==='clients' && (
          <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 10, padding: '0.75rem', boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)' }}>
            <h3 style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: '0.75rem', color: '#1e293b' }}>Client Performance (Avg WER)</h3>
            {globalType === 'summary' ? (
              <div>
                <BarChart labels={clientAgg.labels} values={clientAgg.values} counts={clientAgg.counts} color="#f59e0b" showAxis />
              </div>
            ) : (
              <div style={{ border: '2px dashed #e2e8f0', borderRadius: 10, padding: '1.5rem', color: '#94a3b8', textAlign: 'center', fontSize: '0.8rem' }}>Aggregations require summary metadata. Switch dataset to "Summary".</div>
            )}
          </div>
        )}

        {!loading && tab==='pairs' && (
          <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 10, padding: '0.75rem', boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)' }}>
            <h3 style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: '0.75rem', color: '#1e293b' }}>Best Model + Prompt Pairs (Avg WER)</h3>
            {globalType === 'summary' ? (
              <BarChart labels={pairAgg.labels} values={pairAgg.values} counts={pairAgg.counts} color="#6366f1" showAxis />
            ) : (
              <div style={{ border: '2px dashed #e2e8f0', borderRadius: 10, padding: '1.5rem', color: '#94a3b8', textAlign: 'center', fontSize: '0.8rem' }}>Aggregations require summary metadata. Switch dataset to "Summary".</div>
            )}
          </div>
        )}

        {tab==='corrections' && (
          <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 10, padding: '0.75rem', boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)' }}>
            <h3 style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: '0.75rem', color: '#1e293b' }}>Corrections Explorer</h3>
            <div style={{ marginBottom: 10 }}>
            <Select value={job} onValueChange={(v)=>{ setJob(v); loadCorrectionsFor(v) }}>
              <SelectTrigger style={{ width: '100%' }}>
                <SelectValue placeholder="Select transcription job" />
              </SelectTrigger>
              <SelectContent align="start" position="popper" style={{ width: '100%' }}>
                <div style={{ padding: 8 }}>
                  <input placeholder="Search" value={jobQuery} onChange={e=>setJobQuery(e.target.value)} style={{ width:'100%', border:'1px solid #ddd', padding:8, borderRadius:6 }} />
                </div>
                {transcripts.filter(t => !jobQuery || t.file_name.toLowerCase().includes(jobQuery.toLowerCase())).map(t => (
                  <SelectItem key={t.id} value={t.file_name}>
                    <span style={{ display:'flex', justifyContent:'space-between', width:'100%' }}>
                      <span>{t.file_name}</span>
                      <span style={{ color:'#64748b', fontSize:12 }}>WER {typeof t.wer === 'number' ? t.wer.toFixed(3) : '—'}</span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="analytics-grid-2" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10, marginBottom: 10 }}>
            <div style={{ border: '1px solid #eee', borderRadius: 8, padding: 10 }}>
              <div style={{ fontSize: 12, color: '#475569' }}>Transcription WER/CER/BLEU</div>
              <div style={{ fontSize: 20, fontWeight: 600 }}>
                {jobTranscription ? `${jobTranscription.wer.toFixed(3)} / ${jobTranscription.cer.toFixed(3)} / ${jobTranscription.bleu.toFixed(3)}` : '—'}
              </div>
              {!jobTranscription && <div style={{ marginTop: 4, fontSize: 11, color: '#64748b' }}>No transcription metrics for selected job</div>}
            </div>
            <div style={{ border: '1px solid #eee', borderRadius: 8, padding: 10 }}>
              <div style={{ fontSize: 12, color: '#475569' }}>Summary WER/CER/BLEU</div>
              <div style={{ fontSize: 20, fontWeight: 600 }}>
                {jobSummary ? `${jobSummary.wer.toFixed(3)} / ${jobSummary.cer.toFixed(3)} / ${jobSummary.bleu.toFixed(3)}` : '—'}
              </div>
              {!jobSummary && <div style={{ marginTop: 4, fontSize: 11, color: '#64748b' }}>No summary metrics for selected job</div>}
            </div>
          </div>
          {corrections.length === 0 ? (
            <div style={{ border: '1px dashed #e2e8f0', borderRadius: 8, padding: 10, color: '#64748b', fontSize: '0.8rem' }}>No corrections available for the selected job</div>
          ) : (
            <CorrectionsTable rows={corrections} />
          )}
        </div>
      )}
      </div>
    </div>
  )
}

