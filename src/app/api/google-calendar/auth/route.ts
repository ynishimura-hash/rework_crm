import { NextResponse } from "next/server"

export async function GET() {
    const clientId = process.env.GOOGLE_CLIENT_ID
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3002"
    const redirectUri = process.env.GOOGLE_REDIRECT_URI || `${appUrl}/api/google-calendar/callback`

    if (!clientId) {
        return NextResponse.json(
            { error: "Google Calendar連携が未設定です。GOOGLE_CLIENT_IDを設定してください。" },
            { status: 500 }
        )
    }

    const scopes = [
        "https://www.googleapis.com/auth/calendar.readonly",
        "https://www.googleapis.com/auth/calendar.events",
    ].join(" ")

    const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth")
    authUrl.searchParams.set("client_id", clientId)
    authUrl.searchParams.set("redirect_uri", redirectUri)
    authUrl.searchParams.set("response_type", "code")
    authUrl.searchParams.set("scope", scopes)
    authUrl.searchParams.set("access_type", "offline")
    authUrl.searchParams.set("prompt", "consent")
    // s.sawada@rework.jp.net のアカウントを事前選択
    authUrl.searchParams.set("login_hint", "s.sawada@rework.jp.net")

    return NextResponse.redirect(authUrl.toString())
}
