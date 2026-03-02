import { NextResponse } from "next/server"
import { getCurrentUserFromRequest } from "@/lib/auth-server"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  try {
    const user = getCurrentUserFromRequest(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    return NextResponse.json({ user })
  } catch (error) {
    console.error("[auth/session] error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
