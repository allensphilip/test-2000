import type { Client } from "@/server/clients"
import { useState } from "react"
import { toast } from "sonner"
import { apiFetch } from "@/lib/api"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { MoreHorizontal, Plus, Clipboard, Check, RotateCcw, Trash2 } from "lucide-react"

type Props = { initial: Client[] }


function KeyModal({
  open, onOpenChange, secret, title = "API Key", subtitle,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  secret: string
  title?: string
  subtitle?: string
}) {
  const [copied, setCopied] = useState(false)
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {subtitle && <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>}
        </DialogHeader>

        <div className="space-y-3">
          <div className="rounded-md border bg-amber-50 p-3 text-sm">
            This key is shown <strong>once</strong>. Copy it and store it securely.
          </div>
          <code className="block w-full break-all rounded-md border bg-white px-3 py-2 text-xs">
            {secret}
          </code>
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(secret)
                setCopied(true)
                setTimeout(() => setCopied(false), 1200)
                toast.success("Copied")
              } catch { toast.error("Copy failed") }
            }}
          >
            {copied ? <Check className="mr-2 size-4" /> : <Clipboard className="mr-2 size-4" />}
            Copy
          </Button>
          <Button onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}


function ClientModal({
  client, open, onOpenChange, onRotatedKey, onDeleted,
}: {
  client: Client
  open: boolean
  onOpenChange: (v: boolean) => void
  onRotatedKey: (secret: string) => void
  onDeleted: () => void
}) {
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  const rotate = async () => {
    setBusy(true)
    try {
      const r = await apiFetch(`/api/internal/api-keys/${client.id}/rotate-key`, { method: "POST" })
      if (!r.ok) throw new Error()
      const data = await r.json().catch(() => ({}))
      const secret = data.secret ?? data.key ?? data.apiKey
      if (!secret) throw new Error()
      toast.success("Key rotated")
      onRotatedKey(secret)
    } catch {
      toast.error("Failed to rotate key")
    } finally {
      setBusy(false)
    }
  }

  const del = async () => {
    setBusy(true)
    try {
      const r = await apiFetch(`/api/internal/api-keys/${client.id}`, { method: "DELETE" })
      if (!r.ok) throw new Error()
      toast.success(`Deleted ${client.name}`)
      onDeleted()
      onOpenChange(false)
    } catch {
      toast.error("Failed to delete client")
    } finally {
      setBusy(false)
      setConfirmOpen(false)
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Client</DialogTitle>
            <p className="text-sm text-muted-foreground mt-1">{client.name}</p>
          </DialogHeader>

          <div className="space-y-2 text-sm">
            <div><span className="text-muted-foreground">ID:</span> {client.id}</div>
          </div>

          <Separator className="my-2" />

          <div className="flex items-center gap-2">
            <Button onClick={rotate} disabled={busy} className="gap-2">
              <RotateCcw className="size-4" /> Rotate key
            </Button>

            <Button
              variant="destructive"
              onClick={() => setConfirmOpen(true)}
              disabled={busy}
              className="gap-2"
            >
              <Trash2 className="size-4" /> Delete
            </Button>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* delete confirm */}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{client.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              This action is <strong>irreversible</strong>.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={del}
              disabled={busy}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}


const ClientsList = ({ initial }: Props) => {
  const [items, setItems] = useState<Client[]>(initial)

  const [open, setOpen] = useState(false)
  const [name, setName] = useState("")
  const [saving, setSaving] = useState(false)

  const [current, setCurrent] = useState<Client | null>(null)
  const [showOpen, setShowOpen] = useState(false)

  const [keyOpen, setKeyOpen] = useState(false)
  const [secret, setSecret] = useState<string | null>(null)

  const reload = async () => {
    try {
      const r = await apiFetch("/api/internal/api-keys")
      if (!r.ok) throw new Error()
      const fresh: Client[] = await r.json()
      setItems(fresh)
    } catch {
    }
  }

  const onCreate = async () => {
    if (!name.trim() || saving) return
    setSaving(true)
    try {
      const r = await apiFetch("/api/internal/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      })
      if (!r.ok) throw new Error()
      const data = await r.json()
      const oneTimeKey: string | undefined = data?.key ?? data?.secret ?? data?.apiKey
      toast.success(`Created API-Key for: ${name}`)
      setOpen(false)
      setName("")
      if (oneTimeKey) {
        setSecret(oneTimeKey)
        setKeyOpen(true)
      }
      await reload()
    } catch {
      toast.error("Failed to create client")
    } finally {
      setSaving(false)
    }
  }

  const openShow = (c: Client) => {
    setCurrent(c)
    setShowOpen(true)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Clients</h1>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="size-4" />
              Create Client
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Create Client</DialogTitle>
            </DialogHeader>

            <div className="space-y-1.5">
              <Label htmlFor="client-name">Name</Label>
              <Input
                id="client-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
              />
            </div>

            <Separator className="my-2" />

            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={onCreate} disabled={!name.trim() || saving}>
                {saving ? "Creating…" : "Create"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border bg-white">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-neutral-600">
            <tr>
              <th scope="col" className="px-4 py-2 text-left font-medium">ID</th>
              <th scope="col" className="px-4 py-2 text-left font-medium">Name</th>
              <th scope="col" className="px-2 py-2 w-10" />
            </tr>
          </thead>

          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-4 py-6 text-center text-neutral-500">
                  There are no clients yet
                </td>
              </tr>
            ) : (
              items.map((c) => (
                <tr key={c.id} className="border-t hover:bg-neutral-50/60">
                  <td className="px-4 py-2 font-medium truncate">{c.id}</td>
                  <td className="px-4 py-2">{c.name}</td>
                  <td className="px-2 py-1 text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="size-8">
                          <MoreHorizontal className="size-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {/* Delete also available inside Show modal with confirm;
                            keep here if you want a quick path: */}
                        <DropdownMenuItem
                          onSelect={() => {
                            setCurrent(c)
                            setShowOpen(true)
                          }}
                        >
                          Manage
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Show/Manage client */}
      {current && (
        <ClientModal
          client={current}
          open={showOpen}
          onOpenChange={setShowOpen}
          onRotatedKey={(secret) => { setSecret(secret); setKeyOpen(true) }}
          onDeleted={async () => {
            setItems(prev => prev.filter(x => x.id !== current.id))
          }}
        />
      )}

      {/* One-time key modal */}
      {secret && (
        <KeyModal
          open={keyOpen}
          onOpenChange={(v) => { if (!v) { setKeyOpen(false); setSecret(null) } else setKeyOpen(true) }}
          secret={secret}
          title="API Key"
          subtitle="Copy this key now. It will not be shown again."
        />
      )}
    </div>
  )
}

export default ClientsList

