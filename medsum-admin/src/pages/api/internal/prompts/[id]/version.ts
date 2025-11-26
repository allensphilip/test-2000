import { MEDSUM_API_BASE_URL, MEDSUM_API_KEY } from "@/lib/api-config"
import type { APIRoute } from "astro"

export const getClientId = (req: Request): string | null => {
  const fromHeader = req.headers.get("x-client-id")
  if (!fromHeader) return null

  return fromHeader
}

export const POST: APIRoute = async ({ params, request }) => {
  const id = params.id as string
  if (!id) {
    return new Response(JSON.stringify({ error: "Missing prompt id" }), {
      status: 400, headers: { "Content-Type": "application/json" },
    })
  }

  const { text } = await request.json()
  if (typeof text !== "string" || !text.trim()) {
    return new Response(JSON.stringify({ error: "Missing text" }), {
      status: 400, headers: { "Content-Type": "application/json" },
    })
  }

  const upstream = `${MEDSUM_API_BASE_URL}/internal/prompt/${encodeURIComponent(id)}/version`
  const response = await fetch(upstream, {
    method: 'POST',
    headers: {
      "X-API-Key": MEDSUM_API_KEY,
      "Content-Type": "application/json",
      "Accept": "application/json",
    },
    body: JSON.stringify({ text })
  })

  const body = await response.text()
  return new Response(body, {
    status: response.status,
    headers: { "Content-Type": response.headers.get("content-type") ?? "application/json" },
  })
}
