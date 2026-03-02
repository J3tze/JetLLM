import { NextResponse } from "next/server"
import {
  createUser,
  createSession,
  getUserByEmail,
  SESSION_COOKIE_NAME,
  validateDisplayNameInput,
  validateEmailInput,
  validatePasswordInput,
} from "@/lib/auth"

const IS_PRODUCTION = process.env.NODE_ENV === "production"

type SignupRequest = {
  email?: unknown
  password?: unknown
  displayName?: unknown
}

export const dynamic = "force-dynamic"

export async function POST(request: Request) {
  try {
    const body = await request.json() as SignupRequest
    const email = typeof body.email === "string" ? body.email : ""
    const password = typeof body.password === "string" ? body.password : ""
    const displayName = typeof body.displayName === "string" ? body.displayName : ""

    const emailError = validateEmailInput(email)
    if (emailError) {
      return NextResponse.json({ error: emailError }, { status: 400 })
    }

    const passwordError = validatePasswordInput(password)
    if (passwordError) {
      return NextResponse.json({ error: passwordError }, { status: 400 })
    }

    const displayNameError = validateDisplayNameInput(displayName)
    if (displayNameError) {
      return NextResponse.json({ error: displayNameError }, { status: 400 })
    }

    if (getUserByEmail(email)) {
      return NextResponse.json({ error: "Email is already in use" }, { status: 409 })
    }

    const user = createUser({ email, displayName, password })
    const session = createSession(user.id)

    const response = NextResponse.json({ user }, { status: 201 })
    response.cookies.set({
      name: SESSION_COOKIE_NAME,
      value: session.token,
      httpOnly: true,
      sameSite: "lax",
      secure: IS_PRODUCTION,
      path: "/",
      expires: session.expiresAt,
    })
    return response
  } catch (error) {
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
    }

    const message = error instanceof Error ? error.message : ""
    if (message.includes("UNIQUE constraint failed")) {
      return NextResponse.json({ error: "Email is already in use" }, { status: 409 })
    }

    console.error("[auth/signup] error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
