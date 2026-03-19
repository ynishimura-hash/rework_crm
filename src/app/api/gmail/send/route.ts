import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { sendGmailMessage, isGmailConnected, extractEmailAddress } from "@/lib/gmail"

// メール送信API
export async function POST(request: NextRequest) {
    try {
        const status = await isGmailConnected()
        if (!status.connected) {
            return NextResponse.json({ error: "Gmail未接続" }, { status: 401 })
        }

        const body = await request.json()
        const { to, subject, content, cc, bcc, replyToMessageId, threadId, contactId } = body

        if (!to || !subject || !content) {
            return NextResponse.json({ error: "宛先・件名・本文は必須です" }, { status: 400 })
        }

        // Gmail APIで送信
        const result = await sendGmailMessage({
            to,
            subject,
            body: content,
            cc,
            bcc,
            replyToMessageId,
            threadId,
        })

        // communicationsテーブルに記録
        const supabase = createAdminClient()

        // contactIdが指定されていない場合、メールアドレスから検索
        let resolvedContactId = contactId
        let companyId = null
        if (!resolvedContactId) {
            const toEmail = extractEmailAddress(to)
            const { data: contact } = await supabase
                .from("contacts")
                .select("id, company_id")
                .eq("email", toEmail)
                .single()
            if (contact) {
                resolvedContactId = contact.id
                companyId = contact.company_id
            }
        }

        await supabase.from("communications").insert({
            contact_id: resolvedContactId || null,
            company_id: companyId,
            channel_type: "EMAIL",
            direction: "OUTBOUND",
            subject,
            content,
            sent_at: new Date().toISOString(),
            is_read: true,
            thread_id: result.threadId,
            external_message_id: result.id,
            sender_email: status.email,
            recipient_email: extractEmailAddress(to),
        })

        return NextResponse.json({
            success: true,
            messageId: result.id,
            threadId: result.threadId,
        })
    } catch (err) {
        console.error("Gmail send error:", err)
        const message = err instanceof Error ? err.message : "メール送信に失敗しました"
        return NextResponse.json({ error: message }, { status: 500 })
    }
}
