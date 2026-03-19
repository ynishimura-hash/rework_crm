import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { sendBotMessage } from "@/lib/lineworks"

// LINE Works Bot でメッセージ送信
export async function POST(request: NextRequest) {
    try {
        const { contactId, content } = await request.json()

        if (!contactId || !content) {
            return NextResponse.json({ error: "contactIdとcontentは必須です" }, { status: 400 })
        }

        const supabase = createAdminClient()

        // 担当者のLINE Works UserIDを取得
        const { data: contact } = await supabase
            .from("contacts")
            .select("id, name, line_user_id, company_id")
            .eq("id", contactId)
            .single()

        if (!contact) {
            return NextResponse.json({ error: "担当者が見つかりません" }, { status: 404 })
        }

        if (!contact.line_user_id) {
            return NextResponse.json({ error: "この担当者にはLINE Works IDが設定されていません" }, { status: 400 })
        }

        // Bot経由でメッセージ送信
        await sendBotMessage(contact.line_user_id, content)

        // communicationsテーブルに記録
        await supabase.from("communications").insert({
            contact_id: contact.id,
            company_id: contact.company_id,
            channel_type: "LINE",
            direction: "OUTBOUND",
            subject: null,
            content,
            sent_at: new Date().toISOString(),
            is_read: true,
            thread_id: `lw-${contact.line_user_id}`,
            external_message_id: `lw-out-${Date.now()}`,
        })

        return NextResponse.json({
            success: true,
            message: `${contact.name}にメッセージを送信しました`,
        })
    } catch (err) {
        console.error("LINE Works send error:", err)
        const message = err instanceof Error ? err.message : "送信に失敗しました"
        return NextResponse.json({ error: message }, { status: 500 })
    }
}
