import { NextRequest, NextResponse } from "next/server"
import { markCommunicationAsRead } from "@/app/actions/communications"

// 既読にするAPI
export async function POST(request: NextRequest) {
    try {
        const { id } = await request.json()
        if (!id) {
            return NextResponse.json({ error: "IDが必要です" }, { status: 400 })
        }

        await markCommunicationAsRead(id)
        return NextResponse.json({ success: true })
    } catch (err) {
        console.error("Mark read error:", err)
        return NextResponse.json({ error: "更新に失敗しました" }, { status: 500 })
    }
}
