import { cookies } from "next/headers"
import { NextResponse } from "next/server"
import { invalidateSessionByToken, SESSION_COOKIE_NAME } from "@/lib/auth"

const IS_PRODUCTION = process.env.NODE_ENV === "production"

export const dynamic = "force-dynamic"

export async function POST() {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get(SESSION_COOKIE_NAME)?.value

    if (token) {
      invalidateSessionByToken(token)
    }

    const response = NextResponse.json({ success: true })
    response.cookies.set({
      name: SESSION_COOKIE_NAME,
      value: "",
      httpOnly: true,
      sameSite: "lax",
      secure: IS_PRODUCTION,
      path: "/",
      expires: new Date(0),
    })
    return response
  } catch (error) {
    console.error("[auth/logout] error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
