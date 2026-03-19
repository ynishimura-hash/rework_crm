import { NextResponse } from 'next/server';

export async function GET() {
    const clientId = process.env.FREEE_CLIENT_ID;
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3002";
    // FREEE_REDIRECT_URI があればそれを使い、なければ NEXT_PUBLIC_APP_URL から自動生成
    const redirectUri = process.env.FREEE_REDIRECT_URI || `${appUrl}/api/freee/callback`;

    if (!clientId) {
        return NextResponse.json({ error: 'FREEE_CLIENT_IDが未設定です' }, { status: 500 });
    }

    // freeeの認証URLを構築
    const authUrl = `https://accounts.secure.freee.co.jp/public_api/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code`;

    // freeeのログイン画面へリダイレクト
    return NextResponse.redirect(authUrl);
}
