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

const origin = typeof window === 'undefined'
  ? (process.env.APP_URL_INTERNAL?.replace(/\/$/, '')
    || process.env.APP_URL?.replace(/\/$/, '')
    || 'http://localhost:80')
  : ''

export const fetchTranscriptionList = async (): Promise<TranscriptionRow[]> => {
  try {
    const res = await fetch(`${origin}/api/analytics/transcription/list`, { cache: 'no-store' })
    if (!res.ok) return []
    return res.json() as Promise<TranscriptionRow[]>
  } catch {
    return []
  }
}

export const fetchSummaryList = async (): Promise<SummaryRow[]> => {
  try {
    const res = await fetch(`${origin}/api/analytics/summary/list`, { cache: 'no-store' })
    if (!res.ok) return []
    return res.json() as Promise<SummaryRow[]>
  } catch {
    return []
  }
}

export const fetchCorrections = async (job: string): Promise<{index:number;before:string;after:string}[]> => {
  try {
    const res = await fetch(`${origin}/api/analytics/transcription/${encodeURIComponent(job)}/corrections`, { cache: 'no-store' })
    if (!res.ok) return []
    return res.json()
  } catch {
    return []
  }
}
