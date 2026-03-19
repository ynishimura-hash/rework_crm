import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import {
    getGmailClient,
    parseGmailMessage,
    extractEmailAddress,
    updateHistoryId,
    isGmailConnected,
} from "@/lib/gmail"

// メールアドレスから担当者を検索
async function findContactByEmail(email: string) {
    const supabase = createAdminClient()
    const { data } = await supabase
        .from("contacts")
        .select("id, company_id, name")
        .eq("email", email)
        .single()
    return data
}

// Gmail → communications テーブルに同期
export async function POST() {
    try {
        const status = await isGmailConnected()
        if (!status.connected) {
            return NextResponse.json({ error: "Gmail未接続" }, { status: 401 })
        }

        const { gmail, gmailAddress, historyId } = await getGmailClient()
        const supabase = createAdminClient()

        let syncedCount = 0
        let newHistoryId = historyId

        if (historyId) {
            // 差分同期: history.list を使用
            try {
                const historyResponse = await gmail.users.history.list({
                    userId: "me",
                    startHistoryId: historyId,
                    historyTypes: ["messageAdded"],
                })

                const historyRecords = historyResponse.data.history || []
                newHistoryId = historyResponse.data.historyId || historyId

                // 新しいメッセージIDを収集
                const messageIds = new Set<string>()
                for (const record of historyRecords) {
                    if (record.messagesAdded) {
                        for (const added of record.messagesAdded) {
                            if (added.message?.id) {
                                messageIds.add(added.message.id)
                            }
                        }
                    }
                }

                // 各メッセージの詳細を取得して保存
                for (const messageId of messageIds) {
                    try {
                        const detail = await gmail.users.messages.get({
                            userId: "me",
                            id: messageId,
                            format: "full",
                        })
                        const parsed = parseGmailMessage(detail.data)
                        await saveCommunication(supabase, parsed, gmailAddress)
                        syncedCount++
                    } catch {
                        // 個別メッセージの取得失敗はスキップ
                        console.warn(`メッセージ ${messageId} の取得をスキップ`)
                    }
                }
            } catch {
                // history.list が失敗した場合はフル同期にフォールバック
                console.warn("差分同期に失敗、フル同期を実行")
                syncedCount = await fullSync(gmail, supabase, gmailAddress)
            }
        } else {
            // 初回フル同期: 最新100件を取得
            syncedCount = await fullSync(gmail, supabase, gmailAddress)
        }

        // 最新のhistoryIdを取得して保存
        if (!newHistoryId) {
            const profile = await gmail.users.getProfile({ userId: "me" })
            newHistoryId = profile.data.historyId || null
        }
        if (newHistoryId) {
            await updateHistoryId(newHistoryId)
        }

        return NextResponse.json({
            success: true,
            syncedCount,
            historyId: newHistoryId,
        })
    } catch (err) {
        console.error("Gmail sync error:", err)
        const message = err instanceof Error ? err.message : "同期に失敗しました"
        return NextResponse.json({ error: message }, { status: 500 })
    }
}

// フル同期（初回または差分同期失敗時）
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fullSync(gmail: any, supabase: any, gmailAddress: string): Promise<number> {
    const listResponse = await gmail.users.messages.list({
        userId: "me",
        maxResults: 100,
    })

    const messages = listResponse.data.messages || []
    let syncedCount = 0

    // 10件ずつバッチ処理（API レート制限対策）
    for (let i = 0; i < messages.length; i += 10) {
        const batch = messages.slice(i, i + 10)
        await Promise.all(
            batch.map(async (msg: { id: string }) => {
                try {
                    const detail = await gmail.users.messages.get({
                        userId: "me",
                        id: msg.id,
                        format: "full",
                    })
                    const parsed = parseGmailMessage(detail.data)
                    await saveCommunication(supabase, parsed, gmailAddress)
                    syncedCount++
                } catch {
                    console.warn(`メッセージ ${msg.id} の同期をスキップ`)
                }
            })
        )
    }

    return syncedCount
}

// パース済みメッセージをcommunicationsテーブルに保存
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function saveCommunication(supabase: any, parsed: ReturnType<typeof parseGmailMessage>, gmailAddress: string) {
    // 送受信方向を判定
    const isOutbound = parsed.fromEmail.toLowerCase() === gmailAddress.toLowerCase()
    const counterpartEmail = isOutbound ? parsed.toEmail : parsed.fromEmail

    // 担当者を検索して紐付け
    const contact = await findContactByEmail(counterpartEmail)

    // 重複チェック（external_message_id で判定）
    const { data: existing } = await supabase
        .from("communications")
        .select("id")
        .eq("external_message_id", parsed.id)
        .single()

    if (existing) return // 既に保存済み

    await supabase.from("communications").insert({
        contact_id: contact?.id || null,
        company_id: contact?.company_id || null,
        channel_type: "EMAIL",
        direction: isOutbound ? "OUTBOUND" : "INBOUND",
        subject: parsed.subject,
        content: parsed.body,
        sent_at: parsed.date ? new Date(parsed.date).toISOString() : new Date().toISOString(),
        is_read: !parsed.isUnread,
        thread_id: parsed.threadId,
        external_message_id: parsed.id,
        sender_email: parsed.fromEmail,
        recipient_email: parsed.toEmail,
        attachments: parsed.attachments.length > 0 ? JSON.stringify(parsed.attachments) : "[]",
    })
}
