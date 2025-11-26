import { MEDSUM_API_BASE_URL, MEDSUM_API_KEY } from "@/lib/api-config"
import type { APIRoute } from "astro"


function json(res: Response) {
  return new Response(res.body, {
    status: res.status,
    headers: { "Content-Type": res.headers.get("content-type") ?? "application/json" }
  })
}

export const PATCH: APIRoute = async ({ params, request }) => {
  const id = params.id as string | undefined
  if (!id) {
    return new Response(JSON.stringify({ error: "Missing id" }), {
      status: 400, headers: { "Content-Type": "application/json" }
    })
  }
  const body = await request.json().catch(() => ({}))
  const response = await fetch(`${MEDSUM_API_BASE_URL}/internal/explanations/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: {
      "X-API-Key": MEDSUM_API_KEY,
      "Content-Type": "application/json",
      "Accept": "application/json",
    },
    body: JSON.stringify(body),
  })
  return json(response)
}

export const DELETE: APIRoute = async ({ params }) => {
  const id = params.id as string | undefined
  if (!id) {
    return new Response(JSON.stringify({ error: "Missing id" }), {
      status: 400, headers: { "Content-Type": "application/json" }
    })
  }
  const response = await fetch(`${MEDSUM_API_BASE_URL}/internal/explanations/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: { "X-API-Key": MEDSUM_API_KEY, "Accept": "application/json" },
  })
  return json(response)
}

