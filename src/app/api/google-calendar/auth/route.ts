import { NextResponse } from "next/server"

export async function GET() {
    const clientId = process.env.GOOGLE_CLIENT_ID
    const redirectUri = process.env.GOOGLE_REDIRECT_URI

    if (!clientId || !redirectUri) {
        return NextResponse.json(
            { error: "Google Calendar連携が未設定です。.env.localにGOOGLE_CLIENT_IDとGOOGLE_REDIRECT_URIを設定してください。" },
            { status: 500 }
        )
    }

    const scopes = [
        "https://www.googleapis.com/auth/calendar.readonly",
        "https://www.googleapis.com/auth/calendar.events.readonly",
    ].join(" ")

    const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth")
    authUrl.searchParams.set("client_id", clientId)
    authUrl.searchParams.set("redirect_uri", redirectUri)
    authUrl.searchParams.set("response_type", "code")
    authUrl.searchParams.set("scope", scopes)
    authUrl.searchParams.set("access_type", "offline")
    authUrl.searchParams.set("prompt", "consent")

    return NextResponse.redirect(authUrl.toString())
}
