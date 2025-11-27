export type TranscriptionRow = {
  id: number
  file_name: string
  wer: number
  cer: number
  bleu: number
  created_at: string
  updated_at: string
}

export type SummaryRow = {
  id: number
  file_name: string
  wer: number
  cer: number
  bleu: number
  created_at: string
  updated_at: string
  model_id?: string
  prompt_id?: number
  client_id?: number
}

const isServer = typeof window === 'undefined'
const baseServer = (process.env.ANALYTICS_API_BASE_URL || '').replace(/\/$/, '')

export const fetchTranscriptionList = async (): Promise<TranscriptionRow[]> => {
  try {
    const url = isServer ? `${baseServer}/transcript-analysis/list` : `/api/analytics/transcription/list`
    const res = await fetch(url, { cache: 'no-store' })
    if (!res.ok) return []
    return res.json() as Promise<TranscriptionRow[]>
  } catch {
    return []
  }
}

export const fetchSummaryList = async (): Promise<SummaryRow[]> => {
  try {
    const url = isServer ? `${baseServer}/summary-analysis/list` : `/api/analytics/summary/list`
    const res = await fetch(url, { cache: 'no-store' })
    if (!res.ok) return []
    return res.json() as Promise<SummaryRow[]>
  } catch {
    return []
  }
}

export const fetchCorrections = async (job: string): Promise<{index:number;before:string;after:string}[]> => {
  try {
    const url = isServer ? `${baseServer}/transcript-analysis/${encodeURIComponent(job)}/corrections` : `/api/analytics/transcription/${encodeURIComponent(job)}/corrections`
    const res = await fetch(url, { cache: 'no-store' })
    if (!res.ok) return []
    return res.json()
  } catch {
    return []
  }
}
