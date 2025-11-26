import { getActiveClient } from "./client-selection"

export const apiFetch = (input: string, init: RequestInit = {}) => {
  const selectedClient = getActiveClient()
  const headers = new Headers(init.headers || {})
  if (selectedClient?.id) headers.set("x-client-id", selectedClient.id.toString())

  return fetch(input, { ...init, headers })
}
