import { NextResponse } from "next/server"
import {
  createSession,
  isPrimaryUser,
  publicSignupsEnabled,
  SESSION_COOKIE_NAME,
  validateCredentials,
  validateEmailInput,
  validatePasswordInput,
} from "@/lib/auth"

const IS_PRODUCTION = process.env.NODE_ENV === "production"

type LoginRequest = {
  email?: unknown
  password?: unknown
  rememberMe?: unknown
}

export const dynamic = "force-dynamic"

export async function POST(request: Request) {
  try {
    const body = await request.json() as LoginRequest
    const email = typeof body.email === "string" ? body.email : ""
    const password = typeof body.password === "string" ? body.password : ""
    const rememberMe = body.rememberMe === true

    const emailError = validateEmailInput(email)
    if (emailError) {
      return NextResponse.json({ error: emailError }, { status: 400 })
    }

    const passwordError = validatePasswordInput(password)
    if (passwordError) {
      return NextResponse.json({ error: passwordError }, { status: 400 })
    }

    const user = validateCredentials(email, password)
    if (!user) {
      return NextResponse.json({ error: "Invalid email or password" }, { status: 401 })
    }

    if (!publicSignupsEnabled() && !isPrimaryUser(user.id)) {
      return NextResponse.json(
        { error: "This JetLLM instance is locked to the primary account." },
        { status: 403 }
      )
    }

    const session = createSession(user.id)
    const response = NextResponse.json({ user })
    response.cookies.set({
      name: SESSION_COOKIE_NAME,
      value: session.token,
      httpOnly: true,
      sameSite: "lax",
      secure: IS_PRODUCTION,
      path: "/",
      ...(rememberMe ? { expires: session.expiresAt } : {}),
    })
    return response
  } catch (error) {
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
    }
    console.error("[auth/login] error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
