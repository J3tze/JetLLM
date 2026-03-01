"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { ArrowLeft } from "lucide-react"

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    const frame = requestAnimationFrame(() => setMounted(true))
    return () => cancelAnimationFrame(frame)
  }, [])
  if (!mounted) return null

  return (
    <div className="min-h-screen bg-background [[data-wallpaper]_&]:bg-transparent">
      <header className="border-b border-border px-6 py-4 flex items-center gap-4 safe-area-top [[data-wallpaper]_&]:glass-panel">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <h1 className="text-xl font-bold">Settings</h1>
      </header>
      <main className="max-w-2xl mx-auto p-6">
        {children}
      </main>
    </div>
  )
}
