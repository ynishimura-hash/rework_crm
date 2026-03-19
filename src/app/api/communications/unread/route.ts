import { NextResponse } from "next/server"
import { getUnreadCount } from "@/app/actions/communications"

// 未読数取得API
export async function GET() {
    try {
        const [email, line] = await Promise.all([
            getUnreadCount("EMAIL"),
            getUnreadCount("LINE"),
        ])

        return NextResponse.json({ email, line, total: email + line })
    } catch (err) {
        console.error("Unread count error:", err)
        return NextResponse.json({ email: 0, line: 0, total: 0 })
    }
}
