import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
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
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select"
import { MoreHorizontal, Plus } from "lucide-react"
import { apiFetch } from "@/lib/api"

type Language = "se" | "en" | "no" | "de"

export type Explanation = {
  id: number
  word: string
  explanation: string
  language: Language
}

const LANG_OPTIONS: { value: Language; label: string }[] = [
  { value: "se", label: "Swedish" },
  { value: "en", label: "English" },
  { value: "no", label: "Norwegian" },
  { value: "de", label: "German" },
]

export default function ExplanationsPanel() {
  const [items, setItems] = useState<Explanation[]>([])
  const [loading, setLoading] = useState(true)

  const [filterLang, setFilterLang] = useState<Language | "all">("all")

  const [editorOpen, setEditorOpen] = useState(false)
  const [editing, setEditing] = useState<Explanation | null>(null)
  const [formWord, setFormWord] = useState("")
  const [formExplanation, setFormExplanation] = useState("")
  const [formLang, setFormLang] = useState<Language>("se")
  const [saving, setSaving] = useState(false)

  const [deleteId, setDeleteId] = useState<number | null>(null)
  const [deleting, setDeleting] = useState(false)

  const openCreate = () => {
    setEditing(null)
    setFormWord("")
    setFormExplanation("")
    setFormLang("se")
    setEditorOpen(true)
  }

  const openEdit = (row: Explanation) => {
    setEditing(row)
    setFormWord(row.word)
    setFormExplanation(row.explanation)
    setFormLang(row.language)
    setEditorOpen(true)
  }

  const load = async (lang: Language | "all") => {
    setLoading(true)
    try {
      const url = lang === "all" ? "/api/internal/explanations" : `/api/internal/explanations?language=${lang}`
      const r = await apiFetch(url)
      if (!r.ok) throw new Error()
      const data: Explanation[] = await r.json()
      setItems(data)
    } catch {
      toast.error("Failed to load explanations")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load(filterLang) }, [filterLang])

  const onSave = async () => {
    if (!formWord.trim() || !formExplanation.trim()) return
    setSaving(true)
    try {
      if (editing) {
        const r = await apiFetch(`/api/internal/explanations/${editing.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            word: formWord,
            explanation: formExplanation,
            language: formLang,
          }),
        })
        if (!r.ok) throw new Error()
        toast.success("Updated explanation")
        setEditorOpen(false)
        setItems(prev => prev.map(x => x.id === editing.id ? { ...x, word: formWord, explanation: formExplanation, language: formLang } : x))
      } else {
        const r = await apiFetch(`/api/internal/explanations`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            word: formWord,
            explanation: formExplanation,
            language: formLang,
          }),
        })
        if (!r.ok) throw new Error()
        const created: Explanation = await r.json()
        toast.success("Created explanation")
        setEditorOpen(false)
        setItems(prev => [created, ...prev])
      }
    } catch {
      toast.error("Failed to save")
    } finally {
      setSaving(false)
    }
  }

  const onDelete = async () => {
    if (!deleteId) return
    setDeleting(true)
    const id = deleteId
    const snapshot = items
    setItems(prev => prev.filter(x => x.id !== id))
    try {
      const r = await apiFetch(`/api/internal/explanations/${id}`, { method: "DELETE" })
      if (!r.ok) throw new Error()
      toast.success("Deleted explanation")
    } catch {
      setItems(snapshot)
      toast.error("Failed to delete")
    } finally {
      setDeleting(false)
      setDeleteId(null)
    }
  }

  const filtered = useMemo(() => items, [items])

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">Explanations</h1>

        <div className="flex items-center gap-3">
          <Select value={filterLang} onValueChange={(v) => setFilterLang(v as Language | "all")}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="Language" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All languages</SelectItem>
              {LANG_OPTIONS.map(opt => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2" onClick={openCreate}>
                <Plus className="size-4" />
                Add explanation
              </Button>
            </DialogTrigger>

            <DialogContent className="sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>{editing ? "Edit explanation" : "Add explanation"}</DialogTitle>
              </DialogHeader>

              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="word">Word</Label>
                  <Input id="word" value={formWord} onChange={(e) => setFormWord(e.target.value)} disabled={editing != null} />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="exp">Explanation</Label>
                  <Input id="exp" value={formExplanation} onChange={(e) => setFormExplanation(e.target.value)} />
                </div>

                <div className="space-y-1.5">
                  <Label>Language</Label>
                  <Select value={formLang} onValueChange={(v) => setFormLang(v as Language)}>
                    <SelectTrigger className="w-44">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {LANG_OPTIONS.map(opt => (
                        <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <Separator className="my-2" />

              <DialogFooter className="gap-2">
                <Button variant="outline" onClick={() => setEditorOpen(false)}>Cancel</Button>
                <Button onClick={onSave} disabled={saving || !formWord.trim() || !formExplanation.trim()}>
                  {saving ? "Saving…" : editing ? "Save changes" : "Create"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border bg-white">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-neutral-600">
            <tr>
              <th className="px-4 py-2 text-left font-medium">Word</th>
              <th className="px-4 py-2 text-left font-medium">Explanation</th>
              <th className="px-4 py-2 text-left font-medium">Language</th>
              <th className="px-2 py-2 w-10" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={4} className="px-4 py-6 text-neutral-500">Loading…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={4} className="px-4 py-6 text-neutral-500">No explanations</td></tr>
            ) : (
              filtered.map((row) => (
                <tr key={row.id} className="border-t hover:bg-neutral-50/60">
                  <td className="px-4 py-2 font-medium">{row.word}</td>
                  <td className="px-4 py-2">{row.explanation}</td>
                  <td className="px-4 py-2 uppercase text-neutral-500">{row.language}</td>
                  <td className="px-2 py-1 text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="size-8">
                          <MoreHorizontal className="size-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={() => openEdit(row)}>Edit</DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-red-600 focus:text-red-700"
                          onSelect={() => setDeleteId(row.id)}
                        >
                          Delete
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

      {/* Delete confirm */}
      <AlertDialog open={deleteId !== null} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this explanation?</AlertDialogTitle>
            <AlertDialogDescription>
              This action is <strong>irreversible</strong>.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={onDelete}
              disabled={deleting}
            >
              {deleting ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

