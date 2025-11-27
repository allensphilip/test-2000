import { useEffect, useState } from "react"
import { Input } from "@/components/ui/input"
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select"

export const Filters = ({ onChange }: { onChange: (f: { q?: string; type?: 'transcription'|'summary' }) => void }) => {
  const [q, setQ] = useState<string>("")
  const [type, setType] = useState<'transcription'|'summary'>('summary')

  useEffect(() => {
    try {
      const savedQ = localStorage.getItem('analytics:q') || ''
      const savedT = (localStorage.getItem('analytics:type') as 'transcription'|'summary') || 'summary'
      setQ(savedQ)
      setType(savedT)
      window.dispatchEvent(new CustomEvent('analyticsFilterChange', { detail: { q: savedQ, type: savedT } }))
      onChange({ q: savedQ, type: savedT })
    } catch {}
  }, [])

  const emit = (f: { q?: string; type?: 'transcription'|'summary' }) => {
    try {
      if (typeof f.q === 'string') { setQ(f.q); localStorage.setItem('analytics:q', f.q) }
      if (f.type) { setType(f.type); localStorage.setItem('analytics:type', f.type) }
      window.dispatchEvent(new CustomEvent('analyticsFilterChange', { detail: { q: f.q ?? q, type: f.type ?? type } }))
    } catch {}
    onChange({ q: f.q ?? q, type: f.type ?? type })
  }

  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'center', width: '100%', flexWrap: 'wrap' }}>
      <Input value={q} placeholder="Search job" onInput={(e) => emit({ q: (e.target as HTMLInputElement).value })} style={{ flex: 1, minWidth: 240 }} />
      <Select value={type} onValueChange={(v)=> emit({ type: v as 'transcription'|'summary' })}>
        <SelectTrigger style={{ minWidth: 160 }}><SelectValue placeholder="Dataset" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="transcription">Transcription</SelectItem>
          <SelectItem value="summary">Summary</SelectItem>
        </SelectContent>
      </Select>
    </div>
  )
}
