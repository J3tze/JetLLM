"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { Loader2, Sparkles } from "lucide-react"
import { JetLLMLogo } from "@/components/jetllm-logo"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

type Mode = "login" | "signup"

export function AuthScreen() {
  const router = useRouter()
  const [mounted, setMounted] = useState(false)
  const [mode, setMode] = useState<Mode>("login")
  const [email, setEmail] = useState("")
  const [displayName, setDisplayName] = useState("")
  const [password, setPassword] = useState("")
  const [rememberMe, setRememberMe] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const title = useMemo(() => {
    return mode === "login" ? "Sign in to JetLLM" : "Create your JetLLM account"
  }, [mode])

  const subtitle = useMemo(() => {
    return mode === "login"
      ? "Pick up where your chats and projects left off."
      : "Set your account details and password to unlock the workspace."
  }, [mode])

  const actionLabel = mode === "login" ? "Sign In" : "Create Account"
  const endpoint = mode === "login" ? "/api/auth/login" : "/api/auth/signup"

  useEffect(() => {
    const frame = requestAnimationFrame(() => setMounted(true))
    return () => cancelAnimationFrame(frame)
  }, [])

  if (!mounted) return null

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setIsSubmitting(true)

    try {
      const payload: Record<string, unknown> = {
        email,
        password,
      }
      if (mode === "signup") {
        payload.displayName = displayName
      } else {
        payload.rememberMe = rememberMe
      }

      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        const data = await response.json().catch(() => ({} as { error?: string }))
        setError(typeof data.error === "string" ? data.error : "Authentication failed")
        return
      }

      router.replace("/")
      router.refresh()
    } catch {
      setError("Failed to reach server. Please try again.")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-background text-foreground">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-20 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-primary/20 blur-3xl" />
        <div className="absolute bottom-[-6rem] right-[-4rem] h-64 w-64 rounded-full bg-primary/15 blur-3xl" />
        <div className="absolute top-[55%] left-[-5rem] h-48 w-48 rounded-full bg-white/[0.05] blur-3xl" />
      </div>

      <main className="relative z-10 mx-auto flex min-h-screen w-full max-w-5xl items-center justify-center p-4 sm:p-8">
        <section className="glass-panel w-full max-w-md rounded-3xl border border-white/10 p-6 sm:p-8">
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-4">
              <JetLLMLogo className="h-10 w-auto" />
              <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[11px] text-muted-foreground">
                <Sparkles className="h-3.5 w-3.5 text-primary" />
                AMOLED
              </span>
            </div>

            <div>
              <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
              <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-2 gap-2 rounded-xl border border-white/10 bg-white/[0.02] p-1">
            <Button
              type="button"
              variant={mode === "login" ? "default" : "ghost"}
              className="h-9 rounded-lg"
              onClick={() => {
                setMode("login")
                setError(null)
              }}
            >
              Sign In
            </Button>
            <Button
              type="button"
              variant={mode === "signup" ? "default" : "ghost"}
              className="h-9 rounded-lg"
              onClick={() => {
                setMode("signup")
                setError(null)
              }}
            >
              Create Account
            </Button>
          </div>

          <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
            {mode === "signup" && (
              <div className="space-y-2">
                <Label htmlFor="display-name">Display Name</Label>
                <Input
                  id="display-name"
                  name="displayName"
                  autoComplete="name"
                  placeholder="Your name"
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  disabled={isSubmitting}
                  className="h-10 rounded-lg border-white/15 bg-white/[0.02]"
                />
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                disabled={isSubmitting}
                className="h-10 rounded-lg border-white/15 bg-white/[0.02]"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                placeholder="At least 8 characters"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                disabled={isSubmitting}
                className="h-10 rounded-lg border-white/15 bg-white/[0.02]"
              />
            </div>

            {mode === "login" && (
              <label
                htmlFor="remember-me"
                className="flex items-center gap-2 text-sm text-muted-foreground"
              >
                <input
                  id="remember-me"
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(event) => setRememberMe(event.target.checked)}
                  disabled={isSubmitting}
                  className="h-4 w-4 rounded border-white/20 bg-white/[0.03] accent-[hsl(var(--accent-color))]"
                />
                Keep me logged in
              </label>
            )}

            {error && (
              <p className="rounded-lg border border-destructive/35 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </p>
            )}

            <Button
              type="submit"
              className="h-10 w-full rounded-lg font-medium"
              disabled={isSubmitting}
            >
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : actionLabel}
            </Button>
          </form>
        </section>
      </main>
    </div>
  )
}
