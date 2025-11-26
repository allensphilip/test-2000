import { useEffect, useState } from "react"
import { Card, CardHeader, CardTitle } from "@/components/ui/card"
import { setActiveClient, getActiveClient, type ClientSelection } from "@/lib/client-selection"
import { toast } from "sonner";

type Client = { id: number; name: string } & Record<string, unknown>
type Props = { clients: Client[] }

export default function ClientCards({ clients }: Props) {
  const [activeId, setActiveId] = useState<number | null>(null)

  useEffect(() => {
    const sel = getActiveClient()
    if (sel?.id) setActiveId(sel.id)

    const handler = (e: Event) => {
      const detail = (e as CustomEvent<ClientSelection>).detail
      setActiveId(detail?.id ?? null)
    }
    window.addEventListener("active-client:changed", handler as EventListener)
    return () => window.removeEventListener("active-client:changed", handler as EventListener)
  }, [])

  const onPick = (c: Client) => {
    const sel = { id: c.id, name: c.name }
    setActiveClient(sel)
    setActiveId(c.id)
    toast.success(`Working on client ${c.name}`)
  }

  if (!clients?.length) {
    return (
      <div className="rounded-lg border bg-white p-6 text-sm text-muted-foreground">
        Inga klienter hittades.
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div
        className="grid gap-3"
        style={{ gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))" }}
      >
        {clients.map((c) => {
          const selected = activeId === c.id
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => onPick(c)}
              className="text-left focus:outline-none group w-full"
              aria-pressed={selected}
              aria-label={`Välj klient ${c.name}`}
            >
              <Card
                className={[
                  "transition border shadow-none hover:shadow-sm focus-visible:ring-2",
                  selected ? "border-blue-400 ring-2 ring-blue-200" : "border-neutral-200",
                  "bg-white",
                ].join(" ")}
              >
                <CardHeader className="py-3 px-4">
                  <CardTitle className="text-sm font-medium truncate">{c.name}</CardTitle>
                </CardHeader>
              </Card>
            </button>
          )
        })}
      </div>
    </div>
  )
}

