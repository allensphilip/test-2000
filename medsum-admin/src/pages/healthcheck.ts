import type { APIRoute } from "astro"

export const GET: APIRoute = async () => {
  const body = JSON.stringify({
    ok: true,
    uptimeSec: Math.floor(process.uptime()),
    version: process.env.APP_VERSION ?? null,
    now: new Date().toISOString(),
  })

  return new Response(body, {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  })

}

export const HEAD = GET

