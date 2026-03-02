"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { ArrowLeft, LogOut, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"

export function SettingsLayoutShell({
  children,
}: {
  children: React.ReactNode
}) {
  const [mounted, setMounted] = useState(false)
  const [signingOut, setSigningOut] = useState(false)

  useEffect(() => {
    const frame = requestAnimationFrame(() => setMounted(true))
    return () => cancelAnimationFrame(frame)
  }, [])

  if (!mounted) return null

  async function handleSignOut() {
    setSigningOut(true)
    try {
      await fetch("/api/auth/logout", { method: "POST" })
    } finally {
      window.location.href = "/login"
    }
  }

  return (
    <div className="min-h-screen bg-background [[data-wallpaper]_&]:bg-transparent">
      <header className="border-b border-border px-6 py-4 flex items-center gap-4 safe-area-top [[data-wallpaper]_&]:glass-panel">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <h1 className="text-xl font-bold">Settings</h1>
        <Button
          variant="outline"
          size="sm"
          className="ml-auto"
          onClick={handleSignOut}
          disabled={signingOut}
        >
          {signingOut ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
          Sign Out
        </Button>
      </header>
      <main className="max-w-2xl mx-auto p-6">
        {children}
      </main>
    </div>
  )
}
