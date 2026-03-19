import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { verifyWebhookSignature } from "@/lib/lineworks"

// LINE Works Webhook受信（Botへのメッセージ受信）
export async function POST(request: NextRequest) {
    try {
        const body = await request.text()
        const signature = request.headers.get("x-works-signature") || ""

        // 署名検証
        if (!verifyWebhookSignature(body, signature)) {
            console.error("LINE Works webhook: 署名検証失敗")
            return NextResponse.json({ error: "Invalid signature" }, { status: 401 })
        }

        const data = JSON.parse(body)
        console.log("LINE Works webhook received:", JSON.stringify(data).substring(0, 200))

        // メッセージイベントのみ処理
        if (data.type === "message") {
            const supabase = createAdminClient()
            const userId = data.source?.userId
            const content = data.content?.text || ""
            const messageId = data.source?.messageId || `lw-${Date.now()}`

            // LINE Works UserIDから担当者を検索
            let contactId = null
            let companyId = null
            if (userId) {
                const { data: contact } = await supabase
                    .from("contacts")
                    .select("id, company_id")
                    .eq("line_user_id", userId)
                    .single()

                if (contact) {
                    contactId = contact.id
                    companyId = contact.company_id
                }
            }

            // communicationsテーブルに保存
            await supabase.from("communications").insert({
                contact_id: contactId,
                company_id: companyId,
                channel_type: "LINE",
                direction: "INBOUND",
                subject: null,
                content,
                sent_at: new Date().toISOString(),
                is_read: false,
                thread_id: userId ? `lw-${userId}` : null,
                external_message_id: messageId,
                sender_email: null,
                recipient_email: null,
            })
        }

        // LINE Worksは200 OKを即時返す必要がある
        return NextResponse.json({ status: "ok" })
    } catch (err) {
        console.error("LINE Works webhook error:", err)
        // エラーでも200を返す（LINE Worksのリトライを防ぐ）
        return NextResponse.json({ status: "error" })
    }
}
