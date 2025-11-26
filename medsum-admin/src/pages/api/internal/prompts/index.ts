import { MEDSUM_API_BASE_URL, MEDSUM_API_KEY } from "@/lib/api-config"
import type { APIRoute } from "astro"

// @TODO: Move somewhere else
export const getClientId = (req: Request): string | null => {
  const fromHeader = req.headers.get("x-client-id")
  if (!fromHeader) return null

  return fromHeader
}

export const GET: APIRoute = async ({ request }) => {
  const clientId = Number(getClientId(request))
  if (!clientId) return new Response(JSON.stringify([]), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  })

  const response = await fetch(`${MEDSUM_API_BASE_URL}/internal/prompt`, {
    method: 'GET',
    headers: {
      "X-API-Key": MEDSUM_API_KEY,
      "Content-Type": "application/json",
      "Accept": "application/json",
    },
    cache: "no-store"
  })

  const prompts = await response.json()
  const clientPrompts = prompts.filter((prompt: any) => prompt.clientId === clientId)

  return new Response(JSON.stringify(clientPrompts), {
    status: response.status, headers: { "content-type": response.headers.get("content-type") ?? "application/json" }
  })
}

export const POST: APIRoute = async ({ request }) => {
  const clientId = getClientId(request)
  if (!clientId) return new Response(JSON.stringify([]), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  })

  const payload = await request.json()
  const response = await fetch(`${MEDSUM_API_BASE_URL}/internal/prompt/create`, {
    method: 'POST',
    headers: {
      "X-API-Key": MEDSUM_API_KEY,
      "Content-Type": "application/json",
      "Accept": "application/json",
    },
    body: JSON.stringify(payload),
  })

  return new Response(await response.text(), {
    status: response.status, headers: { "content-type": response.headers.get("content-type") ?? "application/json" }
  })
}
