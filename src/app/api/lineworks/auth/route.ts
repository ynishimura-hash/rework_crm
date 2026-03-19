import { NextResponse } from "next/server"
import { getAccessToken } from "@/lib/lineworks"

// LINE Works 接続テスト（Service Account JWT認証でトークン取得）
export async function GET() {
    try {
        const accessToken = await getAccessToken()

        return NextResponse.json({
            success: true,
            message: "LINE Works接続成功",
            tokenPreview: accessToken.substring(0, 20) + "...",
        })
    } catch (err) {
        console.error("LINE Works auth error:", err)
        const message = err instanceof Error ? err.message : "LINE Works認証に失敗しました"
        return NextResponse.json({ error: message }, { status: 500 })
    }
}
