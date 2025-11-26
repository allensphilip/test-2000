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
    const j = await res.json()
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
      setCorrections(await res.json())
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
    const filtered = details.filter(d => !globalQuery || d.file_name.toLowerCase().includes(globalQuery.toLowerCase()))
    filtered.forEach(d => {
      if (d.prompt_id != null) {
        if (!map.has(d.prompt_id)) map.set(d.prompt_id, [])
        map.get(d.prompt_id)!.push(d.wer)
      }
    })
    const labels: string[] = []
    const values: number[] = []
    Array.from(map.entries()).sort((a,b)=> (a[0]-b[0])).forEach(([pid, arr]) => {
      const avg = arr.reduce((a,b)=>a+b,0)/arr.length
      labels.push(String(pid))
      values.push(avg)
    })
    return { labels, values }
  }, [details, globalQuery])

  const modelAgg = useMemo(() => {
    const map = new Map<string, number[]>()
    const filtered = details.filter(d => !globalQuery || d.file_name.toLowerCase().includes(globalQuery.toLowerCase()))
    filtered.forEach(d => {
      if (d.model_id) {
        if (!map.has(d.model_id)) map.set(d.model_id, [])
        map.get(d.model_id)!.push(d.wer)
      }
    })
    const labels: string[] = []
    const values: number[] = []
    Array.from(map.entries()).sort((a,b)=> a[0].localeCompare(b[0])).forEach(([mid, arr]) => {
      const avg = arr.reduce((a,b)=>a+b,0)/arr.length
      labels.push(mid)
      values.push(avg)
    })
    return { labels, values }
  }, [details, globalQuery])

  const clientAgg = useMemo(() => {
    const map = new Map<number, number[]>()
    const filtered = details.filter(d => !globalQuery || d.file_name.toLowerCase().includes(globalQuery.toLowerCase()))
    filtered.forEach(d => {
      if (d.client_id != null) {
        if (!map.has(d.client_id)) map.set(d.client_id, [])
        map.get(d.client_id)!.push(d.wer)
      }
    })
    const labels: string[] = []
    const values: number[] = []
    Array.from(map.entries()).sort((a,b)=> (a[0]-b[0])).forEach(([cid, arr]) => {
      const avg = arr.reduce((a,b)=>a+b,0)/arr.length
      labels.push(String(cid))
      values.push(avg)
    })
    return { labels, values }
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
    <div style={{ marginTop: 24 }}>
      <div style={{ display: 'flex', gap: 8 }}>
        {(['prompts','models','clients','corrections'] as const).map(t => (
          <Button key={t} variant={tab===t? 'default':'ghost'} onClick={()=>setTab(t)}>{t[0].toUpperCase()+t.slice(1)}</Button>
        ))}
      </div>

      {loading && <div style={{ marginTop: 12 }}>Loading analytics…</div>}

      {!loading && tab==='prompts' && (
        <div style={{ marginTop: 16 }}>
          <h3>Best Prompts (avg WER)</h3>
          <BarChart labels={promptAgg.labels} values={promptAgg.values} />
        </div>
      )}

      {!loading && tab==='models' && (
        <div style={{ marginTop: 16 }}>
          <h3>Model Performance (avg WER)</h3>
          <BarChart labels={modelAgg.labels} values={modelAgg.values} />
        </div>
      )}

      {!loading && tab==='clients' && (
        <div style={{ marginTop: 16 }}>
          <h3>Client Performance (avg WER)</h3>
          <BarChart labels={clientAgg.labels} values={clientAgg.values} />
        </div>
      )}

      {tab==='corrections' && (
        <div style={{ marginTop: 16 }}>
          <h3>Corrections Explorer</h3>
          <div style={{ marginBottom: 12 }}>
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
                      <span style={{ color:'#64748b', fontSize:12 }}>WER {t.wer.toFixed(3)}</span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12, marginBottom: 12 }}>
            <div style={{ border: '1px solid #eee', borderRadius: 8, padding: 12 }}>
              <div style={{ fontSize: 13, color: '#475569' }}>Transcription WER/CER/BLEU</div>
              <div style={{ fontSize: 24, fontWeight: 600 }}>
                {jobTranscription ? `${jobTranscription.wer.toFixed(3)} / ${jobTranscription.cer.toFixed(3)} / ${jobTranscription.bleu.toFixed(3)}` : '—'}
              </div>
            </div>
            <div style={{ border: '1px solid #eee', borderRadius: 8, padding: 12 }}>
              <div style={{ fontSize: 13, color: '#475569' }}>Summary WER/CER/BLEU</div>
              <div style={{ fontSize: 24, fontWeight: 600 }}>
                {jobSummary ? `${jobSummary.wer.toFixed(3)} / ${jobSummary.cer.toFixed(3)} / ${jobSummary.bleu.toFixed(3)}` : '—'}
              </div>
            </div>
          </div>
          <CorrectionsTable rows={corrections} />
        </div>
      )}
    </div>
  )
}
