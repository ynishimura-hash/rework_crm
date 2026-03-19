import { NextResponse } from 'next/server';
export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get('code');
    const error = searchParams.get('error');

    if (error) {
        return NextResponse.json({ error: 'Authorization failed', details: error }, { status: 400 });
    }

    if (!code) {
        return NextResponse.json({ error: 'No authorization code provided' }, { status: 400 });
    }

    const clientId = process.env.FREEE_CLIENT_ID;
    const clientSecret = process.env.FREEE_CLIENT_SECRET;
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3002";
    const redirectUri = process.env.FREEE_REDIRECT_URI || `${appUrl}/api/freee/callback`;

    try {
        // 認可コードを使ってアクセストークンを取得
        const tokenResponse = await fetch('https://accounts.secure.freee.co.jp/public_api/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
                grant_type: 'authorization_code',
                client_id: clientId!,
                client_secret: clientSecret!,
                code: code,
                redirect_uri: redirectUri!,
            }).toString()
        });

        const tokenData = await tokenResponse.json();

        if (!tokenResponse.ok) {
            console.error("Token error:", tokenData);
            return NextResponse.json({ error: 'Failed to get token', details: tokenData }, { status: tokenResponse.status });
        }

        // 成功したら、アクセストークンをクッキーに保存してダッシュボードなどに戻す
        console.log("Freee Accesstoken successfully generated!");

        // Cookie にトークンをセットしてリダイレクト
        const response = NextResponse.redirect(new URL('/deals', request.url));
        response.cookies.set('freee_access_token', tokenData.access_token, {
            path: '/',
            httpOnly: true,
            maxAge: tokenData.expires_in,
        });
        // 対象事業所IDの取得にも使えるためリフレッシュトークンや企業IDも保存できるが、簡易テストのためアクセストークンのみ保存

        return response;

    } catch (err) {
        console.error("Callback error:", err);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
