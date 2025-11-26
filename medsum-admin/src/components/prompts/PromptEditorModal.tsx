import { apiFetch } from "@/lib/api"
import { useEffect, useState } from "react"
import { toast } from "sonner"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "../ui/dialog"
import { Label } from "../ui/label"
import { Input } from "../ui/input"
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "../ui/select"
import { Textarea } from "../ui/textarea"
import { Button } from "../ui/button"
import { Separator } from "../ui/separator"

type Prompt = {
  id: number
  name: string
  type: string
  weight: number
  language: string
  client: { id: number, name: string }
}

type Props = {
  open: boolean
  onOpenChange: (v: boolean) => void
  prompt: Prompt
  onUpdated: (p: Prompt) => void
}

const PromptEditorModal = ({ open, onOpenChange, prompt, onUpdated }: Props) => {
  const [loading, setLoading] = useState<boolean>(false)
  const [saving, setSaving] = useState<boolean>(false)

  const [name, setName] = useState<string>(prompt.name)
  const [weight, setWeight] = useState<number>(prompt.weight)
  const [language, setLanguage] = useState<string>(prompt.language)
  const [type, setType] = useState<string>(prompt.type)
  const [text, setText] = useState<string>("")
  const [originalText, setOriginalText] = useState<string>("")


  useEffect(() => {
    if (!open) return
    setLoading(true)
      ; (async () => {
        try {
          const response = await apiFetch(`/api/internal/prompts/active?prompt=${encodeURIComponent(prompt.id)}&language=${encodeURIComponent(prompt.language)}&type=${encodeURIComponent(prompt.type)}`)
          if (!response.ok) throw new Error()
          const data = await response.json()
          const requestedPrompt = data.pop()
          const activeText = requestedPrompt.PromptVersion[0].text ?? ""
          setName(requestedPrompt.name ?? prompt.name)
          setWeight(requestedPrompt.weight ?? prompt.weight)
          setLanguage(requestedPrompt.language ?? prompt.language)
          setType(data.type ?? prompt.type)
          setText(activeText)
          setOriginalText(activeText)
        } catch (e) {
          console.error(e)
          toast.error("Failed to fetch prompt")
        } finally {
          setLoading(false)
        }
      })()
  }, [open, prompt.id, prompt.language, prompt.type, prompt.weight])

  const onSave = async () => {
    setSaving(true)
    try {
      const metaChanged = (
        name !== prompt.name ||
        Number(weight) !== Number(prompt.weight) ||
        language !== prompt.language ||
        type !== prompt.type
      )

      if (metaChanged) {
        const response = await apiFetch(`/api/internal/prompts/${prompt.id}/update`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ name, weight: Number(weight), language, type })
        })
        if (!response.ok) throw new Error()
        onUpdated({ ...prompt, name, weight: Number(weight), language, type })
      }

      const textChanged = text !== originalText
      if (textChanged) {
        const response = await apiFetch(`/api/internal/prompts/${prompt.id}/version`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
        })
        if (!response.ok) throw new Error("version")
        setOriginalText(text)
      }

      if (!metaChanged && !textChanged) {
        onOpenChange(false)
        return toast.info("No changes")
      }

      toast.success("Prompt updated")
      onOpenChange(false)
    } catch {
      toast.error("Failed to update prompt")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Prompt</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {loading && (
            <div className="text-sm text-neutral-500">Loading active prompt...</div>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="prompt-name">Name</Label>
          <Input id="prompt-name" value={name} onChange={(e) => setName(e.target.value)} />
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

        <Separator className="my-2" />

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={onSave} disabled={saving || !name.trim()}>
            {saving ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default PromptEditorModal
