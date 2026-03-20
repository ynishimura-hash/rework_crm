import Link from "next/link"
import { ShieldCheck, Plus, MapPin, Calendar, AlertTriangle, ChevronRight } from "lucide-react"
import { getSafetySites } from "@/app/actions/safety"
import SafetyScoreBadge from "@/components/safety/SafetyScoreBadge"

export const dynamic = 'force-dynamic'

export default async function SafetyDashboardPage() {
  const sites = await getSafetySites()

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 to-teal-50">
      {/* ヘッダー */}
      <header className="sticky top-0 z-10 bg-white/80 backdrop-blur-md border-b border-emerald-200 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-emerald-600" />
          <h1 className="text-lg font-bold text-emerald-900">安全パトロール</h1>
        </div>
        <Link
          href="/safety/sites/new"
          className="px-3 py-2 bg-emerald-600 text-white rounded-xl text-sm font-medium flex items-center gap-1.5 hover:bg-emerald-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          現場登録
        </Link>
      </header>

      <div className="p-4 max-w-lg mx-auto space-y-4">
        {/* クイックアクション */}
        <Link
          href="/safety/inspect"
          className="block w-full bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-2xl p-5 shadow-lg shadow-emerald-600/20 hover:from-emerald-700 hover:to-teal-700 transition-all active:scale-[0.98]"
        >
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
              <ShieldCheck className="w-7 h-7" />
            </div>
            <div>
              <h2 className="text-lg font-bold">新規点検を開始</h2>
              <p className="text-sm text-emerald-100 mt-0.5">
                写真を撮るだけでAIが安全チェック
              </p>
            </div>
            <ChevronRight className="w-6 h-6 ml-auto opacity-70" />
          </div>
        </Link>

        {/* 現場一覧 */}
        <div className="space-y-3">
          <h2 className="text-sm font-bold text-slate-600 px-1">
            登録現場 ({sites.length})
          </h2>

          {sites.length === 0 ? (
            <div className="bg-white rounded-2xl border border-emerald-200 p-8 text-center">
              <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
                <MapPin className="w-8 h-8 text-emerald-400" />
              </div>
              <p className="text-sm text-slate-500 mb-4">まだ現場が登録されていません</p>
              <Link
                href="/safety/sites/new"
                className="inline-flex items-center gap-1.5 px-5 py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-medium hover:bg-emerald-700 transition-colors"
              >
                <Plus className="w-4 h-4" />
                最初の現場を登録
              </Link>
            </div>
          ) : (
            sites.map((site) => {
              const inspections = (site as any).safety_inspections || []
              const latestInspection = inspections
                .filter((i: any) => i.status === '完了')
                .sort((a: any, b: any) => new Date(b.inspection_date).getTime() - new Date(a.inspection_date).getTime())[0]

              return (
                <Link
                  key={site.id}
                  href={`/safety/sites/${site.id}`}
                  className="block bg-white rounded-2xl border border-emerald-200 p-4 hover:border-emerald-400 hover:shadow-md transition-all active:scale-[0.99]"
                >
                  <div className="flex items-center gap-4">
                    <SafetyScoreBadge
                      score={latestInspection?.overall_score ?? null}
                      size="md"
                    />
                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm font-bold text-slate-900 truncate">{site.name}</h3>
                      {site.address && (
                        <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                          <MapPin className="w-3 h-3 shrink-0" />
                          <span className="truncate">{site.address}</span>
                        </p>
                      )}
                      <div className="flex items-center gap-3 mt-1.5">
                        {latestInspection ? (
                          <>
                            <span className="text-xs text-slate-400 flex items-center gap-1">
                              <Calendar className="w-3 h-3" />
                              {latestInspection.inspection_date}
                            </span>
                            {latestInspection.total_hazards > 0 && (
                              <span className="text-xs text-amber-600 flex items-center gap-1">
                                <AlertTriangle className="w-3 h-3" />
                                {latestInspection.total_hazards}件
                              </span>
                            )}
                          </>
                        ) : (
                          <span className="text-xs text-slate-400">未点検</span>
                        )}
                        <span className={`text-xs px-2 py-0.5 rounded-full ${
                          site.status === '進行中'
                            ? 'bg-emerald-100 text-emerald-700'
                            : site.status === '完了'
                            ? 'bg-slate-100 text-slate-500'
                            : 'bg-amber-100 text-amber-700'
                        }`}>
                          {site.status}
                        </span>
                      </div>
                    </div>
                    <ChevronRight className="w-5 h-5 text-slate-300 shrink-0" />
                  </div>
                </Link>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}
