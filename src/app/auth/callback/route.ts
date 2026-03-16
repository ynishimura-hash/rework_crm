import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const error = searchParams.get('error')

  // OAuthエラー時
  if (error) {
    return NextResponse.redirect(`${origin}/auth/login?error=${encodeURIComponent(error)}`)
  }

  if (!code) {
    return NextResponse.redirect(`${origin}/auth/login?error=no_code`)
  }

  const supabase = await createClient()

  // 認証コードをセッションに交換
  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)
  if (exchangeError) {
    return NextResponse.redirect(`${origin}/auth/login?error=${encodeURIComponent(exchangeError.message)}`)
  }

  // ログインユーザーのメールを取得
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) {
    await supabase.auth.signOut()
    return NextResponse.redirect(`${origin}/auth/login?error=no_email`)
  }

  // ホワイトリストチェック（service_roleで確認）
  const adminClient = createAdminClient()
  const { data: crmUser } = await adminClient
    .from('crm_users')
    .select('id, is_active')
    .eq('email', user.email)
    .single()

  if (!crmUser || !crmUser.is_active) {
    // 未登録 or 無効ユーザー → サインアウトして拒否
    await supabase.auth.signOut()
    return NextResponse.redirect(`${origin}/auth/login?error=unauthorized`)
  }

  // 認証成功 → ダッシュボードへ
  return NextResponse.redirect(`${origin}/`)
}
