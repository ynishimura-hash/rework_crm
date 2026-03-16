import { NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"

// Google Drive OAuth コールバック
export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url)
    const code = searchParams.get("code")
    const error = searchParams.get("error")

    if (error) {
        return NextResponse.redirect(new URL("/scan?error=drive_auth_failed", request.url))
    }

    if (!code) {
        return NextResponse.redirect(new URL("/scan?error=no_code", request.url))
    }

    const clientId = process.env.GOOGLE_CLIENT_ID
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin
    const redirectUri = `${baseUrl}/api/google-drive/callback`

    if (!clientId || !clientSecret) {
        return NextResponse.redirect(new URL("/scan?error=config_missing", request.url))
    }

    try {
        const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
                code,
                client_id: clientId,
                client_secret: clientSecret,
                redirect_uri: redirectUri,
                grant_type: "authorization_code",
            }).toString(),
        })

        const tokenData = await tokenResponse.json()

        if (!tokenResponse.ok) {
            console.error("Google Drive token error:", tokenData)
            return NextResponse.redirect(new URL("/scan?error=token_failed", request.url))
        }

        // Cookieにアクセストークンを保存
        const response = NextResponse.redirect(new URL("/scan?mode=drive", request.url))
        const cookieStore = await cookies()
        response.cookies.set("google_drive_token", tokenData.access_token, {
            path: "/",
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            maxAge: tokenData.expires_in || 3600,
        })

        return response
    } catch (err) {
        console.error("Google Drive callback error:", err)
        return NextResponse.redirect(new URL("/scan?error=internal", request.url))
    }
}
