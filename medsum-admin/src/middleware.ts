import { defineMiddleware } from "astro:middleware";
import { auth } from "./auth";

const isApi = (pathname: string): boolean => {
  return pathname.startsWith("/api/")
}

function isPublic(pathname: string) {
  return (
    pathname === "/login" ||
    pathname === "/healthcheck" ||
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/favicon") ||
    pathname.startsWith("/assets/") ||
    pathname.startsWith("/_image")
  )
}

export const onRequest = defineMiddleware(async (context, next) => {
  const bypass = process.env.DEV_AUTH_BYPASS === "true"
  let sess: any = null
  if (!bypass) {
    sess = await auth.api.getSession({ headers: context.request.headers })
  } else {
    sess = { user: { id: "dev", name: "Developer" }, session: { id: "dev" } }
  }
  ;(context.locals as any).user = sess ? sess.user : null
  ;(context.locals as any).session = sess ? sess.session : null
  const { pathname } = context.url
  if (!isPublic(pathname)) {
    if (isApi(pathname) && (!sess?.user || !sess?.session)) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "content-type": "application/json" },
      })
    }
  }

  return next()
})
