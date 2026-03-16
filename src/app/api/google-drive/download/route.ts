import { NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"

// Google Driveから画像をダウンロードしてbase64で返す
export async function GET(request: NextRequest) {
    const cookieStore = await cookies()
    const token = cookieStore.get("google_drive_token")?.value

    if (!token) {
        return NextResponse.json({ error: "未認証", needsAuth: true }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const fileId = searchParams.get("fileId")

    if (!fileId) {
        return NextResponse.json({ error: "fileIdが必要です" }, { status: 400 })
    }

    try {
        // ファイルメタデータを取得（mimeType確認用）
        const metaRes = await fetch(
            `https://www.googleapis.com/drive/v3/files/${fileId}?fields=mimeType,name,size`,
            { headers: { Authorization: `Bearer ${token}` } }
        )

        if (metaRes.status === 401) {
            return NextResponse.json({ error: "トークン期限切れ", needsAuth: true }, { status: 401 })
        }

        if (!metaRes.ok) {
            return NextResponse.json({ error: "ファイル情報取得に失敗" }, { status: 500 })
        }

        const meta = await metaRes.json()

        // 10MB以上は拒否
        if (meta.size && Number(meta.size) > 10 * 1024 * 1024) {
            return NextResponse.json({ error: "ファイルが大きすぎます（10MB上限）" }, { status: 400 })
        }

        // ファイルコンテンツをダウンロード
        const contentRes = await fetch(
            `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
            { headers: { Authorization: `Bearer ${token}` } }
        )

        if (!contentRes.ok) {
            return NextResponse.json({ error: "ファイルダウンロードに失敗" }, { status: 500 })
        }

        const buffer = await contentRes.arrayBuffer()
        const base64 = Buffer.from(buffer).toString("base64")
        const dataUri = `data:${meta.mimeType};base64,${base64}`

        return NextResponse.json({
            dataUri,
            name: meta.name,
            mimeType: meta.mimeType,
        })
    } catch (error) {
        console.error("Drive download error:", error)
        return NextResponse.json({ error: "内部エラー" }, { status: 500 })
    }
}
