import { MEDSUM_API_BASE_URL, MEDSUM_API_KEY } from "@/lib/api-config"
import type { APIRoute } from "astro"


function json(res: Response) {
  return new Response(res.body, {
    status: res.status,
    headers: { "Content-Type": res.headers.get("content-type") ?? "application/json" }
  })
}

export const GET: APIRoute = async ({ url }) => {
  const language = url.searchParams.get("language")?.trim()
  const upstream = language ? `${MEDSUM_API_BASE_URL}/internal/explanations/${encodeURIComponent(language)}` : `${MEDSUM_API_BASE_URL}/internal/explanations/`
  const response = await fetch(upstream, {
    headers: { "X-API-Key": MEDSUM_API_KEY, "Accept": "application/json" },
    cache: "no-store",
  })
  return json(response)
}

export const POST: APIRoute = async ({ request }) => {
  const body = await request.json().catch(() => ({}))
  const response = await fetch(`${MEDSUM_API_BASE_URL}/internal/explanations/`, {
    method: "POST",
    headers: {
      "X-API-Key": MEDSUM_API_KEY,
      "Content-Type": "application/json",
      "Accept": "application/json",
    },
    body: JSON.stringify(body),
  })
  return json(response)
}

