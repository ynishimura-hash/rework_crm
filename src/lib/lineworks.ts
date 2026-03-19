import { createAdminClient } from "@/lib/supabase/admin"
import * as crypto from "crypto"

// LINE Works API v2.0 クライアント

const TOKEN_URL = "https://auth.worksmobile.com/oauth2/v2.0/token"
const API_BASE = "https://www.worksapis.com/v1.0"

// JWT を生成（Service Account認証用）
function generateJWT(): string {
    const clientId = process.env.LINEWORKS_CLIENT_ID
    const serviceAccount = process.env.LINEWORKS_SERVICE_ACCOUNT
    const privateKey = process.env.LINEWORKS_PRIVATE_KEY

    if (!clientId || !serviceAccount || !privateKey) {
        throw new Error("LINE Works認証情報が未設定です")
    }

    const now = Math.floor(Date.now() / 1000)
    const header = {
        alg: "RS256",
        typ: "JWT",
    }
    const payload = {
        iss: clientId,
        sub: serviceAccount,
        iat: now,
        exp: now + 3600,
    }

    // Base64URL エンコード
    const base64url = (obj: object) =>
        Buffer.from(JSON.stringify(obj))
            .toString("base64")
            .replace(/\+/g, "-")
            .replace(/\//g, "_")
            .replace(/=+$/, "")

    const headerEncoded = base64url(header)
    const payloadEncoded = base64url(payload)
    const signatureInput = `${headerEncoded}.${payloadEncoded}`

    // RSA-SHA256 署名
    // Private Key の改行を復元（環境変数では \n がリテラルになるため）
    const formattedKey = privateKey.replace(/\\n/g, "\n")
    const sign = crypto.createSign("RSA-SHA256")
    sign.update(signatureInput)
    const signature = sign
        .sign(formattedKey, "base64")
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "")

    return `${signatureInput}.${signature}`
}

// アクセストークンを取得（JWT認証）
export async function getAccessToken(): Promise<string> {
    const supabase = createAdminClient()

    // キャッシュされたトークンを確認
    const { data: tokenData } = await supabase
        .from("lineworks_tokens")
        .select("*")
        .eq("user_id", "default")
        .single()

    if (tokenData && tokenData.expires_at) {
        const expiresAt = new Date(tokenData.expires_at)
        // 有効期限の5分前までは既存トークンを使用
        if (expiresAt.getTime() - Date.now() > 5 * 60 * 1000) {
            return tokenData.access_token
        }
    }

    // 新しいトークンを取得
    const clientId = process.env.LINEWORKS_CLIENT_ID
    const clientSecret = process.env.LINEWORKS_CLIENT_SECRET

    if (!clientId || !clientSecret) {
        throw new Error("LINE Works認証情報が未設定です")
    }

    const jwt = generateJWT()

    const response = await fetch(TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
            assertion: jwt,
            grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
            client_id: clientId,
            client_secret: clientSecret,
            scope: "bot",
        }).toString(),
    })

    const data = await response.json()

    if (!response.ok) {
        console.error("LINE Works token error:", data)
        throw new Error(`LINE Worksトークン取得失敗: ${data.error || response.status}`)
    }

    // トークンをDBに保存
    const expiresAt = new Date(Date.now() + (data.expires_in || 86400) * 1000)
    await supabase.from("lineworks_tokens").upsert({
        user_id: "default",
        access_token: data.access_token,
        refresh_token: data.refresh_token || null,
        expires_at: expiresAt.toISOString(),
        bot_id: process.env.LINEWORKS_BOT_ID || null,
        domain_id: process.env.LINEWORKS_DOMAIN_ID || null,
        updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" })

    return data.access_token
}

// LINE Works接続状態を確認
export async function isLineWorksConnected(): Promise<{ connected: boolean; botId?: string }> {
    try {
        // 環境変数が設定されているか確認
        if (!process.env.LINEWORKS_CLIENT_ID || !process.env.LINEWORKS_CLIENT_SECRET) {
            return { connected: false }
        }

        const supabase = createAdminClient()
        const { data } = await supabase
            .from("lineworks_tokens")
            .select("bot_id, expires_at")
            .eq("user_id", "default")
            .single()

        if (!data) return { connected: false }
        return { connected: true, botId: data.bot_id }
    } catch {
        return { connected: false }
    }
}

// Bot でメッセージを送信
export async function sendBotMessage(userId: string, content: string): Promise<void> {
    const accessToken = await getAccessToken()
    const botId = process.env.LINEWORKS_BOT_ID

    if (!botId) {
        throw new Error("LINEWORKS_BOT_IDが未設定です")
    }

    const response = await fetch(`${API_BASE}/bots/${botId}/users/${userId}/messages`, {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${accessToken}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            content: {
                type: "text",
                text: content,
            },
        }),
    })

    if (!response.ok) {
        const error = await response.json()
        console.error("LINE Works send error:", error)
        throw new Error(`メッセージ送信失敗: ${error.message || response.status}`)
    }
}

// メンバー一覧を取得（ドメイン内のユーザー）
export async function getMembers(): Promise<{ userId: string; userName: string; email?: string }[]> {
    const accessToken = await getAccessToken()

    const response = await fetch(`${API_BASE}/users?count=100`, {
        headers: {
            "Authorization": `Bearer ${accessToken}`,
        },
    })

    if (!response.ok) {
        console.error("LINE Works members error:", response.status)
        return []
    }

    const data = await response.json()
    return (data.users || []).map((u: { userId: string; userName?: { lastName?: string; firstName?: string }; email?: string }) => ({
        userId: u.userId,
        userName: `${u.userName?.lastName || ""} ${u.userName?.firstName || ""}`.trim(),
        email: u.email,
    }))
}

// Webhook署名を検証
export function verifyWebhookSignature(body: string, signature: string): boolean {
    const botSecret = process.env.LINEWORKS_WEBHOOK_SECRET
    if (!botSecret) {
        console.warn("LINEWORKS_WEBHOOK_SECRETが未設定、署名検証をスキップ")
        return true
    }

    const hmac = crypto.createHmac("SHA256", botSecret)
    hmac.update(body)
    const expectedSignature = hmac.digest("base64")

    return signature === expectedSignature
}
