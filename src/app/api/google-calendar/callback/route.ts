import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url)
    const code = searchParams.get("code")
    const error = searchParams.get("error")

    if (error) {
        return NextResponse.json({ error: "Authorization failed", details: error }, { status: 400 })
    }

    if (!code) {
        return NextResponse.json({ error: "No authorization code provided" }, { status: 400 })
    }

    const clientId = process.env.GOOGLE_CLIENT_ID
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3002"
    const redirectUri = process.env.GOOGLE_REDIRECT_URI || `${appUrl}/api/google-calendar/callback`

    if (!clientId || !clientSecret) {
        return NextResponse.json({ error: "Google Calendar連携が未設定です" }, { status: 500 })
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
            console.error("Google token error:", tokenData)
            return NextResponse.json({ error: "Failed to get token", details: tokenData }, { status: tokenResponse.status })
        }

        // トークンをSupabaseに保存
        const supabase = createAdminClient()
        await supabase.from("google_calendar_tokens").upsert({
            user_id: "default",
            access_token: tokenData.access_token,
            refresh_token: tokenData.refresh_token || null,
            expires_at: new Date(Date.now() + tokenData.expires_in * 1000).toISOString(),
        }, { onConflict: "user_id" })

        // Cookieにもアクセストークンを保存（短期間）
        const response = NextResponse.redirect(new URL("/calendar", request.url))
        response.cookies.set("google_calendar_token", tokenData.access_token, {
            path: "/",
            httpOnly: true,
            maxAge: tokenData.expires_in,
        })

        return response
    } catch (err) {
        console.error("Google Calendar callback error:", err)
        return NextResponse.json({ error: "Internal server error" }, { status: 500 })
    }
}
