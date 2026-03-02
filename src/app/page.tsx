import { MainShell } from "@/components/app/main-shell"
import { requireCurrentUser } from "@/lib/auth-server"

export default async function HomePage() {
  await requireCurrentUser()
  return (
    <div className="h-screen h-[100dvh] overflow-hidden">
      <MainShell />
    </div>
  )
}
