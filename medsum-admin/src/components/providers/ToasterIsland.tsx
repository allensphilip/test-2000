import { Toaster } from "../ui/sonner"

const ToasterIsland = () => {
  return (
    <Toaster
      position="bottom-right"
      richColors
      closeButton
      duration={3000}
    />
  )
}

export default ToasterIsland
