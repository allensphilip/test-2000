import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "./ui/dialog"
import { Button } from "./ui/button"
import { MoreHorizontal, Plus } from "lucide-react"
import { Label } from "./ui/label"
import { Input } from "./ui/input"
import { Textarea } from "./ui/textarea"
import { Separator } from "./ui/separator"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "./ui/dropdown-menu"
import { apiFetch } from "@/lib/api"
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "./ui/select"
import { getActiveClient } from "@/lib/client-selection"
import PromptEditorModal from "./prompts/PromptEditorModal"
import DeleteConfirm from "./prompts/DeleteConfirm"

type Prompt = {
  id: number
  name: string
  type: string
  weight: number
  language: string
  client: { id: number, name: string }
}

type Props = { initial: Prompt[] }

const PromptsList = ({ initial }: Props) => {
  const [prompts, setPrompts] = useState<Prompt[]>(initial)
  const [editorOpen, setEditorOpen] = useState<boolean>(false)
  const [current, setCurrent] = useState<Prompt | null>(null)
  const [open, setOpen] = useState<boolean>(false)
  const [name, setName] = useState<string>("")
  const [text, setText] = useState<string>("")
  const [language, setLanguage] = useState<string>("")
  const [type, setType] = useState<string>("")
  const [weight, setWeight] = useState<number>(0)
  const [saving, setSaving] = useState<boolean>(false)
  const [deletingId, setDeletingId] = useState<number | null>(null)

  const openEditor = (prompt: Prompt) => {
    setCurrent(prompt)
    setEditorOpen(true)
  }

  const applyUpdate = (p: Prompt) => {
    setPrompts(prev => prev.map(x => (x.id === p.id ? { ...x, ...p } : x)))
  }

  useEffect(() => {
    let ignore = false
    const load = async () => {
      try {
        const response = await apiFetch("/api/internal/prompts")
        if (!response.ok) throw new Error()
        const data = await response.json()
        if (!ignore) setPrompts(data)
      } catch { }
    }
    load()
    return () => { ignore = true }
  }, [])

  const canSave = useMemo(() => name.trim() && text.trim() && language.trim() && weight > 0 && type.trim(), [name, text, language, weight, type])

  const onCreate = async () => {
    if (!canSave && saving && !getActiveClient()) return
    setSaving(true)
    try {
      const response = await apiFetch("/api/internal/prompts", {
        method: 'POST',
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name,
          text: text,
          weight: weight,
          language: language,
          type: type,
          clientId: getActiveClient()?.id
        })
      })
      if (!response.ok) throw new Error()
      const created = await response.json()
      const createdPrompt: Prompt = {
        id: created.version.promptId,
        name: name,
        type: type,
        weight: weight,
        language: language,
        client: getActiveClient()!
      }
      setPrompts((p) => [createdPrompt, ...p])
      setOpen(false)
      setName("")
      setText("")
      setType("")
      setLanguage("")
      setWeight(0)
      toast.success("Created Prompt")
    } catch {
      toast.error("Failed to create prompt")
    } finally {
      setSaving(false)
    }
  }

  const onDelete = async (prompt: Prompt) => {
    const snapshot = prompts
    setDeletingId(prompt.id)
    setPrompts(prev => prev.filter(p => p.id !== prompt.id))
    try {
      const response = await apiFetch(`/api/internal/prompts/${prompt.id}`, {
        method: 'DELETE'
      })
      if (!response.ok) throw new Error()
      setPrompts(prev => prev.filter(p => p.id !== prompt.id))
      toast.success(`Removed ${prompt.name}`)
    } catch {
      setPrompts(snapshot)
      toast.error(`Failed to remove ${prompt.name}`)
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Prompts</h1>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="size-4" />
              Add Prompt
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Add Prompt</DialogTitle>
            </DialogHeader>

            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="prompt-client">Client</Label>
                <Input id="prompt-client" type="text" value={getActiveClient()?.name} disabled />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="prompt-name">Name</Label>
                <Input id="prompt-name" type="text" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="prompt-language">Language</Label>
                <Select onValueChange={(value) => setLanguage(value)} value={language}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select a language" />
                  </SelectTrigger>
                  <SelectContent id="prompt-language">
                    <SelectGroup>
                      <SelectLabel>Language</SelectLabel>
                      <SelectItem value="se">Swedish</SelectItem>
                      <SelectItem value="en">English</SelectItem>
                      <SelectItem value="no">Norwegian</SelectItem>
                      <SelectItem value="de">German</SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="prompt-type">Type</Label>
                <Select onValueChange={(value) => setType(value)} value={type}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select a type" />
                  </SelectTrigger>
                  <SelectContent id="prompt-type">
                    <SelectGroup>
                      <SelectLabel>Type</SelectLabel>
                      <SelectItem value="conversation">conversation</SelectItem>
                      <SelectItem value="dictation">dictation</SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="prompt-text">Prompt</Label>
                <Textarea id="prompt-text" value={text} onChange={(e) => setText(e.target.value)} rows={5} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="prompt-weight">Weight</Label>
                <Input id="prompt-weight" type="number" value={weight} onChange={(e) => setWeight(Number(e.target.value))} />
              </div>
            </div>

            <Separator className="my-2" />

            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={onCreate} disabled={!canSave || saving}>
                {saving ? "Creating.." : "Create"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* List */}
      <div className="overflow-hidden rounded-xl border bg-white">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-neutral-600">
            <tr>
              <th scope="col" className="px-4 py-2 text-left font-medium">Name</th>
              <th scope="col" className="px-4 py-2 text-left font-medium">Type</th>
              <th scope="col" className="px-4 py-2 text-left font-medium">Language</th>
              <th scope="col" className="px-4 py-2 text-left font-medium">Weight</th>
              <th scope="col" className="px-2 py-2 w-10" />
            </tr>
          </thead>

          <tbody>
            {prompts.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-neutral-500">
                  There are no prompts yet
                </td>
              </tr>
            ) : (
              prompts.map((p) => (
                <tr key={p.id} className="border-t hover:bg-neutral-50/60">
                  <td className="px-4 py-2 font-medium truncate">{p.name}</td>
                  <td className="px-4 py-2 text-neutral-500">{p.type}</td>
                  <td className="px-4 py-2 text-neutral-500">{p.language}</td>
                  <td className="px-4 py-2 text-neutral-500">{p.weight}</td>
                  <td className="px-2 py-1 text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="size-8">
                          <MoreHorizontal className="size-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => openEditor(p)}>Show</DropdownMenuItem>
                        <DeleteConfirm
                          prompt={p}
                          onConfirm={onDelete}
                          disabled={deletingId === p.id}
                        >
                          <DropdownMenuItem onSelect={(e) => e.preventDefault()} className="text-red-600 focus:text-red-700">
                            {deletingId === p.id ? "Removing…" : "Delete"}
                          </DropdownMenuItem>
                        </DeleteConfirm>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {current && (
        <PromptEditorModal
          open={editorOpen}
          onOpenChange={setEditorOpen}
          prompt={current}
          onUpdated={applyUpdate}
        />
      )}
    </div>
  )
}

export default PromptsList
