import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"

// メール作成用の担当者リスト取得API（emailがある人のみ）
export async function GET() {
    try {
        const supabase = createAdminClient()
        const { data, error } = await supabase
            .from("contacts")
            .select("id, name, email, companies:company_id (id, name)")
            .not("email", "is", null)
            .order("name")

        if (error) throw error
        return NextResponse.json(data || [])
    } catch (err) {
        console.error("Contacts for compose error:", err)
        return NextResponse.json([])
    }
}
