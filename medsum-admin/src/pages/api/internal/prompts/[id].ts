import type { APIRoute } from "astro";
import { getClientId } from ".";
import { MEDSUM_API_BASE_URL, MEDSUM_API_KEY } from "@/lib/api-config";

export const DELETE: APIRoute = async ({ params, request }) => {
  const id = params.id!
  const clientId = getClientId(request)
  if (!clientId) return new Response(JSON.stringify([]), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  })

  const response = await fetch(`${MEDSUM_API_BASE_URL}/internal/prompt/${id}`, {
    method: 'DELETE',
    headers: {
      "X-API-Key": MEDSUM_API_KEY,
      "Accept": "application/json",
    }
  })

  return new Response(await response.text(), {
    status: response.status,
    headers: { "Content-Type": response.headers.get("Content-Type") ?? "application/json" },
  })
}
