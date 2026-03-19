import { NextRequest, NextResponse } from "next/server"
import { getGmailMessages, isGmailConnected } from "@/lib/gmail"

// メール一覧取得API
export async function GET(request: NextRequest) {
    try {
        const status = await isGmailConnected()
        if (!status.connected) {
            return NextResponse.json({ error: "Gmail未接続", connected: false }, { status: 401 })
        }

        const { searchParams } = new URL(request.url)
        const query = searchParams.get("q") || ""
        const maxResults = parseInt(searchParams.get("maxResults") || "20", 10)
        const pageToken = searchParams.get("pageToken") || undefined

        const result = await getGmailMessages({
            query,
            maxResults,
            pageToken,
        })

        return NextResponse.json({
            messages: result.messages,
            nextPageToken: result.nextPageToken,
            connected: true,
            email: status.email,
        })
    } catch (err) {
        console.error("Gmail messages error:", err)
        const message = err instanceof Error ? err.message : "メール取得に失敗しました"
        return NextResponse.json({ error: message }, { status: 500 })
    }
}
