import { redirect } from "next/navigation"
import { AuthScreen } from "@/components/auth/auth-screen"
import { getCurrentUser } from "@/lib/auth-server"

export default async function LoginPage() {
  const user = await getCurrentUser()
  if (user) {
    redirect("/")
  }

  return <AuthScreen />
}
