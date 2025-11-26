import { authClient } from "@/lib/auth-client"
import { Button } from "../ui/button"
import { Separator } from "../ui/separator"
import {
  LogOut,
  FileText,
  KeyRound,
  MessageSquare,
  Sparkles,
  Briefcase,
  Home,
  BarChart2,
} from "lucide-react"
import { clearActiveClient, getActiveClient, type ClientSelection } from "@/lib/client-selection"
import { useEffect, useState, } from "react"
import { Badge } from "../ui/badge"

type Props = {
  user: { name: string, email: string }
  active?: "overview" | "prompts" | "keys" | "explanations" | "features" | "analytics"
  onNav?: (path: string) => void
}

const DashboardSidebar = ({ user, active, onNav }: Props) => {
  const go = (href: string): void => {
    if (onNav) return onNav(href)
    window.location.href = href
  }

  const [activeClient, setActiveClient] = useState<ClientSelection | null>(null)

  useEffect(() => {
    setActiveClient(getActiveClient() ?? null)

    const handler = (e: Event) => {
      const detail = (e as CustomEvent<ClientSelection>).detail
      setActiveClient(detail ?? null)
    }

    window.addEventListener("active-client:changed", handler as EventListener)
    return () => window.removeEventListener("active-client:changed", handler as EventListener)
  }, [])


  return (
    <aside className="h-screen w-64 border-r bg-white flex flex-col">
      {/* Header */}
      <div className="px-4 pt-6 pb-4">
        <div className="text-sm text-muted-foreground">Logged in as</div>
        <div className="text-lg font-semibold truncate" title={user.name}>
          {user.name}
        </div>
        <div className="text-sm text-muted-foreground">{user.email}</div>
      </div>

      {/* Active client line */}
      <div className="px-4 pb-4 flex items-center gap-2 text-sm">
        <Briefcase className="size-4 text-neutral-700" aria-hidden />
        {activeClient ? (
          <Badge variant="secondary" className="max-w-[11rem] truncate">
            {activeClient.name}
          </Badge>
        ) : (
          <span className="text-neutral-500">No client picked</span>
        )}
      </div>

      <Separator />

      {/* Nav */}
      <nav className="p-2 space-y-1">
        <Button asChild variant={active === "overview" ? "default" : "ghost"} className="w-full justify-start gap-2">
          <a href="/">
            <Home className="size-4" aria-hidden />
            Overview
          </a>
        </Button>
        <Button asChild variant={active === "prompts" ? "default" : "ghost"} className="w-full justify-start gap-2">
          <a href="/prompts">
            <MessageSquare className="size-4" aria-hidden />
            Prompts
          </a>
        </Button>

        <Button asChild variant={active === "keys" ? "default" : "ghost"} className="w-full justify-start gap-2">
          <a href="/api-keys">
            <KeyRound className="size-4" aria-hidden />
            API Keys
          </a>
        </Button>

        <Button asChild variant={active === "explanations" ? "default" : "ghost"} className="w-full justify-start gap-2">
          <a href="/explanations">
            <FileText className="size-4" aria-hidden />
            Explanations
          </a>
        </Button>

        <Button asChild variant={active === "features" ? "default" : "ghost"} className="w-full justify-start gap-2">
          <a href="/app/features">
            <Sparkles className="size-4" aria-hidden />
            Features
          </a>
        </Button>

        <Button asChild variant={active === "analytics" ? "default" : "ghost"} className="w-full justify-start gap-2">
          <a href="/analytics">
            <BarChart2 className="size-4" aria-hidden />
            Analytics
          </a>
        </Button>
      </nav>

      {/* Footer */}
      <div className="mt-auto p-2">
        <Button variant="ghost"
          className="w-full justify-start gap-2 text-red-600 hover:text-red-700"
          onClick={async () => {
            try { clearActiveClient() } catch { }
            await authClient.signOut()
            window.location.href = "/login"
          }}
        >
          <LogOut className="size-4" aria-hidden />
          Sign out
        </Button>
      </div>
    </aside>
  )
}

export default DashboardSidebar
