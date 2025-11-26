import { MEDSUM_API_BASE_URL, MEDSUM_API_KEY } from "@/lib/api-config"
import type { APIRoute } from "astro"

export const getClientId = (req: Request): string | null => {
  const fromHeader = req.headers.get("x-client-id")
  if (!fromHeader) return null

  return fromHeader
}

export const GET: APIRoute = async ({ request, url }) => {
  const clientId = getClientId(request)
  const promptId = url.searchParams.get("prompt")
  const language = url.searchParams.get("language") || ""
  const type = url.searchParams.get("type") || ""

  if (!clientId || !promptId || !language || !type) {
    return new Response(JSON.stringify({ error: "Missing clientId, language or type" }), {
      status: 400, headers: { "Content-Type": "application/json" },
    })
  }

  const upstream = `${MEDSUM_API_BASE_URL}/internal/prompt/active/${encodeURIComponent(clientId)}/${encodeURIComponent(language)}/${encodeURIComponent(type)}`
  const response = await fetch(upstream, {
    method: 'GET',
    headers: {
      "X-API-Key": MEDSUM_API_KEY,
      "Content-Type": "application/json",
      "Accept": "application/json",
    }
  })

  const body = await response.text()
  const prompts = JSON.parse(body)
  return new Response(JSON.stringify(prompts.filter((prompt: any) => prompt.id === Number(promptId))), {
    status: response.status,
    headers: { "Content-Type": response.headers.get("Content-Type") ?? "application/json" },
  })
}
