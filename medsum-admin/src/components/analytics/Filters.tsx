import { Input } from "@/components/ui/input"
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select"

export const Filters = ({ onChange }: { onChange: (f: { q?: string; type?: 'transcription'|'summary' }) => void }) => {
  const emit = (f: { q?: string; type?: 'transcription'|'summary' }) => {
    try { window.dispatchEvent(new CustomEvent('analyticsFilterChange', { detail: f })) } catch {}
    onChange(f)
  }
  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'center', width: '100%' }}>
      <Input placeholder="Search job" onInput={(e) => emit({ q: (e.target as HTMLInputElement).value })} style={{ flex: 1, minWidth: 240 }} />
      <Select defaultValue="summary" onValueChange={(v)=> emit({ type: v as 'transcription'|'summary' })}>
        <SelectTrigger style={{ minWidth: 160 }}><SelectValue placeholder="Dataset" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="transcription">Transcription</SelectItem>
          <SelectItem value="summary">Summary</SelectItem>
        </SelectContent>
      </Select>
    </div>
  )
}
