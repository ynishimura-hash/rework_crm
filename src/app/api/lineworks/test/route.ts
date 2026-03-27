import { NextRequest, NextResponse } from "next/server"
import { getAccessToken, getMembers, sendBotMessage } from "@/lib/lineworks"

// LINE Works テスト用エンドポイント
// GET: メンバー一覧取得
// POST: テストメッセージ送信（userId指定）
export async function GET() {
    try {
        const members = await getMembers()

        return NextResponse.json({
            success: true,
            membersCount: members.length,
            members,
        })
    } catch (err) {
        console.error("LINE Works test error:", err)
        const message = err instanceof Error ? err.message : "テスト失敗"
        return NextResponse.json({ error: message }, { status: 500 })
    }
}

export async function POST(request: NextRequest) {
    try {
        const { userId, message } = await request.json()

        if (!userId) {
            return NextResponse.json({ error: "userIdは必須です" }, { status: 400 })
        }

        const content = message || "Rework CRMからのテストメッセージです 🎉"

        await sendBotMessage(userId, content)

        return NextResponse.json({
            success: true,
            message: `${userId}にメッセージを送信しました`,
            content,
        })
    } catch (err) {
        console.error("LINE Works send test error:", err)
        const message = err instanceof Error ? err.message : "送信テスト失敗"
        return NextResponse.json({ error: message }, { status: 500 })
    }
}
