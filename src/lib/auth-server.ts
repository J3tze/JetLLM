import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import {
  getUserFromSessionToken,
  isPrimaryUser,
  publicSignupsEnabled,
  SESSION_COOKIE_NAME,
  type SafeUser,
} from "@/lib/auth"

function getCookieValue(header: string | null, name: string): string | null {
  if (!header) return null

  const parts = header.split(";")
  for (const part of parts) {
    const [rawKey, ...rawValue] = part.trim().split("=")
    if (rawKey !== name) continue
    const value = rawValue.join("=")
    if (!value) return null
    try {
      return decodeURIComponent(value)
    } catch {
      return value
    }
  }

  return null
}

export function getCurrentUserFromRequest(request: Request): SafeUser | null {
  const token = getCookieValue(request.headers.get("cookie"), SESSION_COOKIE_NAME)
  if (!token) return null
  const user = getUserFromSessionToken(token)
  if (!user) return null
  if (!publicSignupsEnabled() && !isPrimaryUser(user.id)) return null
  return user
}

export async function getCurrentUser(): Promise<SafeUser | null> {
  const cookieStore = await cookies()
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value
  if (!token) return null
  const user = getUserFromSessionToken(token)
  if (!user) return null
  if (!publicSignupsEnabled() && !isPrimaryUser(user.id)) return null
  return user
}

export async function requireCurrentUser(): Promise<SafeUser> {
  const user = await getCurrentUser()
  if (!user) {
    redirect("/login")
  }
  return user
}
