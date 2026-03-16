import { NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"

// Google Driveの画像ファイル一覧を取得
export async function GET(request: NextRequest) {
    const cookieStore = await cookies()
    const token = cookieStore.get("google_drive_token")?.value

    if (!token) {
        return NextResponse.json({ error: "未認証", needsAuth: true }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const folderId = searchParams.get("folderId") || "root"
    const pageToken = searchParams.get("pageToken") || undefined

    try {
        // 画像ファイルとフォルダを取得
        const query = folderId === "root"
            ? "mimeType contains 'image/' and trashed = false"
            : `'${folderId}' in parents and (mimeType contains 'image/' or mimeType = 'application/vnd.google-apps.folder') and trashed = false`

        const params = new URLSearchParams({
            q: query,
            fields: "nextPageToken,files(id,name,mimeType,thumbnailLink,createdTime,size)",
            pageSize: "50",
            orderBy: "createdTime desc",
        })
        if (pageToken) params.set("pageToken", pageToken)

        const res = await fetch(`https://www.googleapis.com/drive/v3/files?${params}`, {
            headers: { Authorization: `Bearer ${token}` },
        })

        if (res.status === 401) {
            return NextResponse.json({ error: "トークン期限切れ", needsAuth: true }, { status: 401 })
        }

        if (!res.ok) {
            const err = await res.text()
            console.error("Drive API error:", err)
            return NextResponse.json({ error: "Driveからファイル取得に失敗" }, { status: 500 })
        }

        const data = await res.json()
        return NextResponse.json(data)
    } catch (error) {
        console.error("Drive files error:", error)
        return NextResponse.json({ error: "内部エラー" }, { status: 500 })
    }
}
