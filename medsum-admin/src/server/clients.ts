import { MEDSUM_API_BASE_URL, MEDSUM_API_KEY } from "@/lib/api-config"

export type Client = {
  id: number,
  name: string,
}

export const listClients = async (): Promise<Client[]> => {
  const res = await fetch(`${MEDSUM_API_BASE_URL}/internal/auth/clients`, {
    method: 'GET',
    headers: {
      "X-API-Key": MEDSUM_API_KEY,
      "Accept": "application/json",
      "Content-Type": "application/json",
    },
    cache: "no-store"
  })

  if (!res.ok) {
    const text = await res.text().catch(() => "")
    throw new Error(`Clients fetch failed ${res.status} ${res.statusText} ${text}`)
  }

  return res.json() as Promise<Client[]>
}
