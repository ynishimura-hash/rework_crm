"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft, MapPin, Loader2, Building2 } from "lucide-react"
import Link from "next/link"
import { createSafetySite } from "@/app/actions/safety"

export default function NewSafetySitePage() {
  const router = useRouter()
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setIsSubmitting(true)

    try {
      const formData = new FormData(e.currentTarget)
      await createSafetySite(formData)
      router.push('/safety')
    } catch (err) {
      console.error('Failed to create site:', err)
      alert('現場の登録に失敗しました')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 to-teal-50">
      <header className="sticky top-0 z-10 bg-white/80 backdrop-blur-md border-b border-emerald-200 px-4 py-3 flex items-center gap-3">
        <Link href="/safety" className="p-2 -ml-2 rounded-full hover:bg-emerald-100 transition-colors">
          <ArrowLeft className="w-5 h-5 text-emerald-700" />
        </Link>
        <div className="flex items-center gap-2">
          <MapPin className="w-5 h-5 text-emerald-600" />
          <h1 className="text-lg font-bold text-emerald-900">現場登録</h1>
        </div>
      </header>

      <form onSubmit={handleSubmit} className="p-4 max-w-lg mx-auto space-y-4">
        <div className="bg-white rounded-2xl border border-emerald-200 p-4 space-y-4">
          {/* 現場名 */}
          <div>
            <label className="text-xs font-bold text-slate-700">
              現場名 <span className="text-rose-500">*</span>
            </label>
            <input
              name="name"
              type="text"
              required
              placeholder="例：渋谷ビル新築工事"
              className="w-full mt-1 px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
            />
          </div>

          {/* 所在地 */}
          <div>
            <label className="text-xs font-bold text-slate-700">所在地</label>
            <input
              name="address"
              type="text"
              placeholder="例：愛媛県松山市..."
              className="w-full mt-1 px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
            />
          </div>

          {/* 現場監督 */}
          <div>
            <label className="text-xs font-bold text-slate-700">現場監督</label>
            <input
              name="site_manager"
              type="text"
              placeholder="例：山田太郎"
              className="w-full mt-1 px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
            />
          </div>

          {/* 備考 */}
          <div>
            <label className="text-xs font-bold text-slate-700">備考</label>
            <textarea
              name="notes"
              rows={3}
              placeholder="現場に関する特記事項..."
              className="w-full mt-1 px-3 py-2.5 border border-slate-200 rounded-xl text-sm resize-none focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full py-3.5 bg-emerald-600 text-white rounded-2xl font-bold text-base hover:bg-emerald-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              登録中...
            </>
          ) : (
            <>
              <Building2 className="w-5 h-5" />
              現場を登録
            </>
          )}
        </button>
      </form>
    </div>
  )
}
