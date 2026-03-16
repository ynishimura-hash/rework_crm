import { NextResponse } from 'next/server';

export async function GET() {
    const clientId = process.env.FREEE_CLIENT_ID;
    const redirectUri = process.env.FREEE_REDIRECT_URI;

    if (!clientId || !redirectUri) {
        return NextResponse.json({ error: 'Missing Freee credentials' }, { status: 500 });
    }

    // freeeの認証URLを構築
    const authUrl = `https://accounts.secure.freee.co.jp/public_api/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code`;

    // freeeのログイン画面へリダイレクト
    return NextResponse.redirect(authUrl);
}
