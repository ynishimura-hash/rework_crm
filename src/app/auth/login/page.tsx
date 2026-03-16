"use client"

import { Suspense, useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { createClient } from "@/lib/supabase/client"

const ERROR_MESSAGES: Record<string, string> = {
  unauthorized: "このアカウントにはアクセス権限がありません。管理者にお問い合わせください。",
  no_email: "メールアドレスを取得できませんでした。もう一度お試しください。",
  no_code: "認証に失敗しました。もう一度お試しください。",
}

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [checkingSession, setCheckingSession] = useState(true)

  useEffect(() => {
    // URLパラメータからエラーメッセージを取得
    const errorParam = searchParams.get("error")
    if (errorParam) {
      setError(ERROR_MESSAGES[errorParam] || errorParam)
    }

    // 既にログイン済みならリダイレクト
    const checkSession = async () => {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      if (session) {
        router.replace("/")
      }
      setCheckingSession(false)
    }
    checkSession()
  }, [searchParams, router])

  const handleGoogleLogin = async () => {
    setLoading(true)
    setError(null)

    const supabase = createClient()
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    })

    if (error) {
      setError(error.message)
      setLoading(false)
    }
  }

  if (checkingSession) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-blue-50/30 to-indigo-50/40 px-4">
      <div className="w-full max-w-sm">
        {/* ロゴ・タイトル */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center h-14 w-14 rounded-2xl bg-blue-600 shadow-lg shadow-blue-600/20 mb-4">
            <span className="text-white font-bold text-2xl font-mono">E</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-800 tracking-tight">
            Rework CRM
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            ログインして続行してください
          </p>
        </div>

        {/* ログインカード */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
          {error && (
            <div className="mb-6 p-3 bg-rose-50 border border-rose-200 rounded-lg">
              <p className="text-sm text-rose-700">{error}</p>
            </div>
          )}

          <button
            onClick={handleGoogleLogin}
            disabled={loading}
            className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-white border border-slate-300 rounded-xl text-sm font-medium text-slate-700 hover:bg-slate-50 hover:border-slate-400 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
          >
            {loading ? (
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-slate-600" />
            ) : (
              <svg className="h-5 w-5" viewBox="0 0 24 24">
                <path
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                  fill="#4285F4"
                />
                <path
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  fill="#34A853"
                />
                <path
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  fill="#FBBC05"
                />
                <path
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  fill="#EA4335"
                />
              </svg>
            )}
            {loading ? "ログイン中..." : "Googleでログイン"}
          </button>

          <p className="text-xs text-slate-400 text-center mt-4">
            許可されたアカウントのみログインできます
          </p>
        </div>
      </div>
    </div>
  )
}

// Suspense境界でuseSearchParamsをラップ
export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    }>
      <LoginForm />
    </Suspense>
  )
}
