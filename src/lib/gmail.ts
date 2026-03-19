import { google } from "googleapis"
import { createAdminClient } from "@/lib/supabase/admin"

// OAuth2クライアントを作成
function createOAuth2Client() {
    return new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3002"}/api/gmail/callback`
    )
}

// 有効なGmailクライアントを取得（トークン自動リフレッシュ付き）
export async function getGmailClient() {
    const supabase = createAdminClient()
    const { data: tokenData } = await supabase
        .from("gmail_tokens")
        .select("*")
        .eq("user_id", "default")
        .single()

    if (!tokenData) {
        throw new Error("Gmail未接続: /api/gmail/auth で認証してください")
    }

    const oauth2Client = createOAuth2Client()
    oauth2Client.setCredentials({
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
    })

    // トークンリフレッシュ時にDBを更新
    oauth2Client.on("tokens", async (tokens) => {
        if (tokens.access_token) {
            await supabase.from("gmail_tokens").update({
                access_token: tokens.access_token,
                expires_at: tokens.expiry_date
                    ? new Date(tokens.expiry_date).toISOString()
                    : null,
                updated_at: new Date().toISOString(),
            }).eq("user_id", "default")
        }
    })

    return {
        gmail: google.gmail({ version: "v1", auth: oauth2Client }),
        gmailAddress: tokenData.gmail_address,
        historyId: tokenData.history_id,
    }
}

// Gmail接続状態を確認
export async function isGmailConnected(): Promise<{ connected: boolean; email?: string }> {
    const supabase = createAdminClient()
    const { data } = await supabase
        .from("gmail_tokens")
        .select("gmail_address, expires_at")
        .eq("user_id", "default")
        .single()

    if (!data) return { connected: false }
    return { connected: true, email: data.gmail_address }
}

// メールヘッダーから値を取得するヘルパー
function getHeader(headers: { name: string; value: string }[], name: string): string {
    return headers.find(h => h.name.toLowerCase() === name.toLowerCase())?.value || ""
}

// MIMEメッセージからプレーンテキスト本文を抽出
function extractBody(payload: {
    mimeType?: string
    body?: { data?: string }
    parts?: Array<{ mimeType?: string; body?: { data?: string }; parts?: unknown[] }>
}): string {
    // シンプルなメッセージ
    if (payload.body?.data) {
        return Buffer.from(payload.body.data, "base64url").toString("utf-8")
    }

    // マルチパートメッセージ
    if (payload.parts) {
        // text/plain を優先
        const textPart = payload.parts.find(p => p.mimeType === "text/plain")
        if (textPart?.body?.data) {
            return Buffer.from(textPart.body.data, "base64url").toString("utf-8")
        }
        // text/html にフォールバック
        const htmlPart = payload.parts.find(p => p.mimeType === "text/html")
        if (htmlPart?.body?.data) {
            return Buffer.from(htmlPart.body.data, "base64url").toString("utf-8")
        }
        // ネストされたパーツを再帰的に検索
        for (const part of payload.parts) {
            if (part.parts) {
                const nested = extractBody(part as typeof payload)
                if (nested) return nested
            }
        }
    }

    return ""
}

// メールアドレスだけを抽出（"名前 <email>" 形式から）
export function extractEmailAddress(headerValue: string): string {
    const match = headerValue.match(/<([^>]+)>/)
    return match ? match[1] : headerValue.trim()
}

// Gmailメッセージをパースして統一フォーマットに変換
export interface ParsedGmailMessage {
    id: string
    threadId: string
    subject: string
    from: string
    fromEmail: string
    to: string
    toEmail: string
    date: string
    snippet: string
    body: string
    labelIds: string[]
    isUnread: boolean
    attachments: { filename: string; mimeType: string; size: number }[]
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parseGmailMessage(message: any): ParsedGmailMessage {
    const headers = message.payload?.headers || []
    const from = getHeader(headers, "From")
    const to = getHeader(headers, "To")

    // 添付ファイル情報を抽出
    const attachments: { filename: string; mimeType: string; size: number }[] = []
    const extractAttachments = (parts: Array<{ filename?: string; mimeType?: string; body?: { size?: number; attachmentId?: string }; parts?: unknown[] }> | undefined) => {
        if (!parts) return
        for (const part of parts) {
            if (part.filename && part.body?.attachmentId) {
                attachments.push({
                    filename: part.filename,
                    mimeType: part.mimeType || "application/octet-stream",
                    size: part.body.size || 0,
                })
            }
            if (part.parts) {
                extractAttachments(part.parts as typeof parts)
            }
        }
    }
    extractAttachments(message.payload?.parts)

    return {
        id: message.id,
        threadId: message.threadId,
        subject: getHeader(headers, "Subject") || "(件名なし)",
        from,
        fromEmail: extractEmailAddress(from),
        to,
        toEmail: extractEmailAddress(to),
        date: getHeader(headers, "Date"),
        snippet: message.snippet || "",
        body: extractBody(message.payload || {}),
        labelIds: message.labelIds || [],
        isUnread: (message.labelIds || []).includes("UNREAD"),
        attachments,
    }
}

// メール一覧を取得
export async function getGmailMessages(options: {
    query?: string
    maxResults?: number
    pageToken?: string
} = {}) {
    const { gmail } = await getGmailClient()
    const { query, maxResults = 20, pageToken } = options

    // メッセージID一覧を取得
    const listResponse = await gmail.users.messages.list({
        userId: "me",
        q: query || "",
        maxResults,
        pageToken: pageToken || undefined,
    })

    const messages = listResponse.data.messages || []
    if (messages.length === 0) {
        return { messages: [], nextPageToken: null }
    }

    // 各メッセージの詳細を並列取得
    const detailedMessages = await Promise.all(
        messages.map(async (msg) => {
            const detail = await gmail.users.messages.get({
                userId: "me",
                id: msg.id!,
                format: "full",
            })
            return parseGmailMessage(detail.data)
        })
    )

    return {
        messages: detailedMessages,
        nextPageToken: listResponse.data.nextPageToken || null,
    }
}

// Gmail メッセージを送信
export async function sendGmailMessage(options: {
    to: string
    subject: string
    body: string
    cc?: string
    bcc?: string
    replyToMessageId?: string
    threadId?: string
}) {
    const { gmail, gmailAddress } = await getGmailClient()

    // RFC 2822形式のメッセージを構築
    const headers = [
        `From: ${gmailAddress}`,
        `To: ${options.to}`,
        options.cc ? `Cc: ${options.cc}` : "",
        options.bcc ? `Bcc: ${options.bcc}` : "",
        `Subject: ${options.subject}`,
        "MIME-Version: 1.0",
        "Content-Type: text/html; charset=utf-8",
        options.replyToMessageId ? `In-Reply-To: ${options.replyToMessageId}` : "",
        options.replyToMessageId ? `References: ${options.replyToMessageId}` : "",
    ].filter(Boolean).join("\r\n")

    const rawMessage = `${headers}\r\n\r\n${options.body}`
    const encodedMessage = Buffer.from(rawMessage).toString("base64url")

    const response = await gmail.users.messages.send({
        userId: "me",
        requestBody: {
            raw: encodedMessage,
            threadId: options.threadId || undefined,
        },
    })

    return {
        id: response.data.id,
        threadId: response.data.threadId,
    }
}

// メッセージを既読にする
export async function markGmailAsRead(messageId: string) {
    const { gmail } = await getGmailClient()
    await gmail.users.messages.modify({
        userId: "me",
        id: messageId,
        requestBody: {
            removeLabelIds: ["UNREAD"],
        },
    })
}

// 履歴IDを更新
export async function updateHistoryId(historyId: string) {
    const supabase = createAdminClient()
    await supabase.from("gmail_tokens").update({
        history_id: historyId,
        updated_at: new Date().toISOString(),
    }).eq("user_id", "default")
}
