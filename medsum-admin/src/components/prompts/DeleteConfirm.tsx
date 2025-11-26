import type React from "react"
import { AlertDialog, AlertDialogAction, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "../ui/alert-dialog"

type Prompt = {
  id: number
  name: string
  type: string
  weight: number
  language: string
  client: { id: number, name: string }
}

type Props = {
  prompt: Prompt
  onConfirm: (p: Prompt) => void
  disabled?: boolean
  children: React.ReactNode
}

const DeleteConfirm = ({ prompt, onConfirm, disabled, children }: Props) => {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <span aria-disabled={disabled} className={disabled ? "pointer-events-none opacity-50" : ""}>
          {children}
        </span>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete "{prompt.name}"?</AlertDialogTitle>
          <AlertDialogDescription>
            This action is <strong>irreversable</strong>. The prompt and its data will be permanently removed.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogAction>Cancel</AlertDialogAction>
          <AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={() => onConfirm(prompt)}>Delete</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

export default DeleteConfirm
