import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url)
    const code = searchParams.get("code")
    const error = searchParams.get("error")

    if (error) {
        return NextResponse.json({ error: "Gmail認証に失敗しました", details: error }, { status: 400 })
    }

    if (!code) {
        return NextResponse.json({ error: "認証コードがありません" }, { status: 400 })
    }

    const clientId = process.env.GOOGLE_CLIENT_ID
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3002"
    const redirectUri = `${appUrl}/api/gmail/callback`

    if (!clientId || !clientSecret) {
        return NextResponse.json({ error: "Gmail連携が未設定です" }, { status: 500 })
    }

    try {
        // 認証コードをトークンに交換
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
            console.error("Gmail token error:", tokenData)
            return NextResponse.json({ error: "トークン取得に失敗しました", details: tokenData }, { status: tokenResponse.status })
        }

        // Gmailアドレスを取得
        const profileResponse = await fetch("https://www.googleapis.com/gmail/v1/users/me/profile", {
            headers: { Authorization: `Bearer ${tokenData.access_token}` },
        })
        const profileData = await profileResponse.json()
        const gmailAddress = profileData.emailAddress || ""

        // トークンをSupabaseに保存
        const supabase = createAdminClient()
        await supabase.from("gmail_tokens").upsert({
            user_id: "default",
            access_token: tokenData.access_token,
            refresh_token: tokenData.refresh_token || null,
            expires_at: new Date(Date.now() + tokenData.expires_in * 1000).toISOString(),
            gmail_address: gmailAddress,
            updated_at: new Date().toISOString(),
        }, { onConflict: "user_id" })

        // Cookieにもアクセストークンを保存
        const response = NextResponse.redirect(new URL("/communications", request.url))
        response.cookies.set("gmail_access_token", tokenData.access_token, {
            path: "/",
            httpOnly: true,
            maxAge: tokenData.expires_in,
        })

        return response
    } catch (err) {
        console.error("Gmail callback error:", err)
        return NextResponse.json({ error: "内部エラーが発生しました" }, { status: 500 })
    }
}
