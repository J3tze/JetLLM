import { SettingsLayoutShell } from "@/components/settings/settings-layout-shell"
import { requireCurrentUser } from "@/lib/auth-server"

export default async function SettingsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  await requireCurrentUser()
  return <SettingsLayoutShell>{children}</SettingsLayoutShell>
}
