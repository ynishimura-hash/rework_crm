import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// 認証不要の公開ルート
const PUBLIC_ROUTES = [
  '/auth/login',
  '/auth/callback',
  '/lp',
  '/scan',
  '/api/line/webhook',
  '/api/scan',
  '/api/gmail',
  '/api/google-calendar',
  '/api/lineworks',
  '/api/freee',
]

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // 開発環境では認証をバイパス
  if (process.env.NODE_ENV === 'development') {
    return NextResponse.next()
  }

  // 公開ルートはスキップ
  if (PUBLIC_ROUTES.some(route => pathname.startsWith(route))) {
    return NextResponse.next()
  }

  // 静的アセットはスキップ
  if (pathname.startsWith('/_next') || pathname.startsWith('/favicon')) {
    return NextResponse.next()
  }

  let response = NextResponse.next({
    request: { headers: request.headers },
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            request.cookies.set(name, value)
            response.cookies.set(name, value, options)
          })
        },
      },
    }
  )

  // セッション確認（トークンリフレッシュも自動実行）
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    // 未認証 → ログインページへ
    const loginUrl = new URL('/auth/login', request.url)
    return NextResponse.redirect(loginUrl)
  }

  return response
}

export const config = {
  matcher: [
    // 静的ファイルとNext.js内部ルートを除外
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
