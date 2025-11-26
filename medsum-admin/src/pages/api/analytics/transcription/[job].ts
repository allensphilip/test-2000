import type { APIRoute } from "astro"

export const GET: APIRoute = async ({ params }) => {
  try {
    const job = params.job as string
    const base = process.env.ANALYTICS_API_BASE_URL as string
    const res = await fetch(`${base}/transcript-analysis/${encodeURIComponent(job)}`, { cache: "no-store" })
    const body = await res.text().catch(() => "")
    return new Response(body, { status: res.status, headers: { "content-type": res.headers.get("content-type") || "application/json" } })
  } catch (e: any) {
    return new Response(JSON.stringify({ error: "analytics fetch failed", detail: String(e?.message || e) }), { status: 502, headers: { "content-type": "application/json" } })
  }
}
