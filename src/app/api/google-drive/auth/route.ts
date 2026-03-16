import { NextRequest, NextResponse } from "next/server"

// Google Drive OAuth認証開始
export async function GET(request: NextRequest) {
    const clientId = process.env.GOOGLE_CLIENT_ID
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin

    if (!clientId) {
        return NextResponse.json(
            { error: "GOOGLE_CLIENT_IDが未設定です" },
            { status: 500 }
        )
    }

    const redirectUri = `${baseUrl}/api/google-drive/callback`

    const scopes = [
        "https://www.googleapis.com/auth/drive.readonly",
    ].join(" ")

    const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth")
    authUrl.searchParams.set("client_id", clientId)
    authUrl.searchParams.set("redirect_uri", redirectUri)
    authUrl.searchParams.set("response_type", "code")
    authUrl.searchParams.set("scope", scopes)
    authUrl.searchParams.set("access_type", "offline")
    authUrl.searchParams.set("prompt", "consent")
    authUrl.searchParams.set("state", "drive_scan")

    return NextResponse.redirect(authUrl.toString())
}
