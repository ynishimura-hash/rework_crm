import { NextRequest, NextResponse } from "next/server"
import { getAccessToken, isLineWorksConnected } from "@/lib/lineworks"

const API_BASE = "https://www.worksapis.com/v1.0"

// LINE Works メッセージ履歴取得
export async function GET(request: NextRequest) {
    try {
        const status = await isLineWorksConnected()
        if (!status.connected) {
            return NextResponse.json({ error: "LINE Works未接続", connected: false }, { status: 401 })
        }

        const { searchParams } = new URL(request.url)
        const userId = searchParams.get("userId")
        const botId = process.env.LINEWORKS_BOT_ID

        if (!userId || !botId) {
            return NextResponse.json({ error: "userIdとBOT_IDが必要です" }, { status: 400 })
        }

        const accessToken = await getAccessToken()

        // Bot のメッセージ履歴を取得
        const response = await fetch(
            `${API_BASE}/bots/${botId}/users/${userId}/messages?count=50`,
            {
                headers: {
                    "Authorization": `Bearer ${accessToken}`,
                },
            }
        )

        if (!response.ok) {
            const error = await response.json()
            return NextResponse.json({ error: error.message || "メッセージ取得失敗" }, { status: response.status })
        }

        const data = await response.json()
        return NextResponse.json({
            messages: data.messages || [],
            connected: true,
        })
    } catch (err) {
        console.error("LINE Works messages error:", err)
        const message = err instanceof Error ? err.message : "メッセージ取得に失敗"
        return NextResponse.json({ error: message }, { status: 500 })
    }
}
