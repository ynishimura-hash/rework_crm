import { NextRequest, NextResponse } from "next/server"
import { getCommunications } from "@/app/actions/communications"

// コミュニケーション一覧取得API（クライアントコンポーネントから呼び出し用）
export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url)
        const channelType = searchParams.get("channelType") as "EMAIL" | "LINE" | null
        const search = searchParams.get("search")
        const page = parseInt(searchParams.get("page") || "1", 10)
        const limit = parseInt(searchParams.get("limit") || "20", 10)

        const result = await getCommunications({
            channelType,
            search,
            page,
            limit,
        })

        return NextResponse.json(result)
    } catch (err) {
        console.error("Communications API error:", err)
        return NextResponse.json({ data: [], total: 0, error: "取得に失敗しました" }, { status: 500 })
    }
}
