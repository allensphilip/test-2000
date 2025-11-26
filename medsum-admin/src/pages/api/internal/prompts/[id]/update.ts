import { MEDSUM_API_BASE_URL, MEDSUM_API_KEY } from "@/lib/api-config"
import type { APIRoute } from "astro"

export const PUT: APIRoute = async ({ params, request }) => {
  const id = params.id as string
  if (!id) {
    return new Response(JSON.stringify({ error: "Missing prompt id" }), {
      status: 400, headers: { "Content-Type": "application/json" },
    })
  }

  const requestBody = await request.json()
  const payload = {
    name: requestBody.name ?? "",
    weight: Number(requestBody.weight ?? 0),
    language: requestBody.language ?? "",
    type: requestBody.type ?? ""
  }

  const upstream = `${MEDSUM_API_BASE_URL}/internal/prompt/${encodeURIComponent(id)}/update`
  const response = await fetch(upstream, {
    method: 'PUT',
    headers: {
      "X-API-Key": MEDSUM_API_KEY,
      "Content-Type": "application/json",
      "Accept": "application/json",
    },
    body: JSON.stringify(payload)
  })

  const body = await response.text()
  return new Response(body, {
    status: response.status,
    headers: { "Content-Type": response.headers.get("content-type") ?? "application/json" },
  })
}

