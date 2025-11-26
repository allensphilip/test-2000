import { authClient } from "@/lib/auth-client"
import { Button } from "../ui/button"

const MicrosoftSignIn = () => {
  return (
    <Button
      onClick={async () => {
        await authClient.signIn.social({
          provider: 'microsoft',
          callbackURL: '/',
        })
      }}
    >
      Sign in with Microsoft
    </Button>
  )
}

export default MicrosoftSignIn
