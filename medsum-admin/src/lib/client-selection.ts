export const ACTIVE_CLIENT_KEY = "activeClient"
export const ACTIVE_CLIENT_EVENT = "active-client:changed"

export type ClientSelection = {
  id: number
  name: string
}

export const setActiveClient = (c: ClientSelection) => {
  try {
    localStorage.setItem(ACTIVE_CLIENT_KEY, JSON.stringify(c))
    window.dispatchEvent(new CustomEvent("active-client:changed"))
  } catch {
    console.error("Failed to set activeClient")
  } finally {
    window.dispatchEvent(new CustomEvent(ACTIVE_CLIENT_EVENT, { detail: c }))
  }
}

export const getActiveClient = (): ClientSelection | null => {
  try {
    const raw = localStorage.getItem(ACTIVE_CLIENT_KEY)
    return raw ? (JSON.parse(raw) as ClientSelection) : null
  } catch {
    console.error("Failed to fetch activeClient")
    return null
  }
}

export const clearActiveClient = () => {
  try { localStorage.removeItem(ACTIVE_CLIENT_KEY) } finally {
    window.dispatchEvent(new CustomEvent(ACTIVE_CLIENT_EVENT, { detail: null }))
  }
}
