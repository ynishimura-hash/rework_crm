import Link from "next/link"
import { notFound } from "next/navigation"
import {
  ArrowLeft, ShieldCheck, MapPin, User, Calendar, AlertTriangle,
  ChevronRight, Plus, FileText
} from "lucide-react"
import { getSafetySiteById } from "@/app/actions/safety"
import SafetyScoreBadge from "@/components/safety/SafetyScoreBadge"

export const dynamic = 'force-dynamic'

export default async function SafetySiteDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const site = await getSafetySiteById(id)

  if (!site) {
    notFound()
  }

  const inspections = (site as any).safety_inspections || []
  const completedInspections = inspections.filter((i: any) => i.status === '完了')
  const latestScore = completedInspections[0]?.overall_score ?? null

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 to-teal-50">
      {/* ヘッダー */}
      <header className="sticky top-0 z-10 bg-white/80 backdrop-blur-md border-b border-emerald-200 px-4 py-3 flex items-center gap-3">
        <Link href="/safety" className="p-2 -ml-2 rounded-full hover:bg-emerald-100 transition-colors">
          <ArrowLeft className="w-5 h-5 text-emerald-700" />
        </Link>
        <h1 className="text-lg font-bold text-emerald-900 truncate flex-1">{site.name}</h1>
        <SafetyScoreBadge score={latestScore} size="sm" />
      </header>

      <div className="p-4 max-w-lg mx-auto space-y-4">
        {/* 現場情報 */}
        <div className="bg-white rounded-2xl border border-emerald-200 p-4 space-y-2">
          {site.address && (
            <p className="text-sm text-slate-600 flex items-center gap-2">
              <MapPin className="w-4 h-4 text-slate-400 shrink-0" />
              {site.address}
            </p>
          )}
          {site.site_manager && (
            <p className="text-sm text-slate-600 flex items-center gap-2">
              <User className="w-4 h-4 text-slate-400 shrink-0" />
              現場監督: {site.site_manager}
            </p>
          )}
          <div className="flex items-center gap-2">
            <span className={`text-xs px-2 py-0.5 rounded-full ${
              site.status === '進行中'
                ? 'bg-emerald-100 text-emerald-700'
                : site.status === '完了'
                ? 'bg-slate-100 text-slate-500'
                : 'bg-amber-100 text-amber-700'
            }`}>
              {site.status}
            </span>
            <span className="text-xs text-slate-400">
              {completedInspections.length}回の点検実施
            </span>
          </div>
        </div>

        {/* 点検開始ボタン */}
        <Link
          href={`/safety/inspect?siteId=${site.id}`}
          className="block w-full bg-emerald-600 text-white rounded-2xl p-4 text-center font-bold hover:bg-emerald-700 transition-colors shadow-lg shadow-emerald-600/20 flex items-center justify-center gap-2"
        >
          <ShieldCheck className="w-5 h-5" />
          この現場で点検を開始
        </Link>

        {/* 安全スコア推移 */}
        {completedInspections.length > 0 && (
          <div className="bg-white rounded-2xl border border-emerald-200 p-4">
            <h2 className="text-sm font-bold text-slate-700 mb-3">安全スコア推移</h2>
            <div className="flex items-end gap-1 h-24">
              {completedInspections.slice(0, 10).reverse().map((insp: any, i: number) => {
                const score = insp.overall_score || 0
                const height = `${Math.max(score, 5)}%`
                const color = score >= 80
                  ? 'bg-emerald-400'
                  : score >= 60
                  ? 'bg-amber-400'
                  : 'bg-rose-400'
                return (
                  <div key={i} className="flex-1 flex flex-col items-center gap-1">
                    <span className="text-[10px] text-slate-500">{score}</span>
                    <div
                      className={`w-full rounded-t ${color} transition-all`}
                      style={{ height }}
                    />
                  </div>
                )
              })}
            </div>
            <div className="flex justify-between mt-1">
              <span className="text-[10px] text-slate-400">過去</span>
              <span className="text-[10px] text-slate-400">最新</span>
            </div>
          </div>
        )}

        {/* 点検履歴 */}
        <div className="space-y-2">
          <h2 className="text-sm font-bold text-slate-600 px-1 flex items-center gap-2">
            <FileText className="w-4 h-4" />
            点検履歴
          </h2>

          {inspections.length === 0 ? (
            <div className="bg-white rounded-2xl border border-emerald-200 p-6 text-center">
              <p className="text-sm text-slate-500">まだ点検が実施されていません</p>
            </div>
          ) : (
            inspections.map((insp: any) => (
              <Link
                key={insp.id}
                href={`/safety/inspections/${insp.id}`}
                className="block bg-white rounded-xl border border-slate-200 p-4 hover:border-emerald-300 transition-all"
              >
                <div className="flex items-center gap-3">
                  <SafetyScoreBadge score={insp.overall_score} size="sm" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-slate-900">
                        {insp.inspection_date}
                      </span>
                      <span className={`text-xs px-1.5 py-0.5 rounded ${
                        insp.status === '完了' ? 'bg-slate-100 text-slate-500' : 'bg-blue-100 text-blue-600'
                      }`}>
                        {insp.status}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-0.5">
                      <span className="text-xs text-slate-500">
                        {insp.inspector_name}
                      </span>
                      {insp.weather && (
                        <span className="text-xs text-slate-400">{insp.weather}</span>
                      )}
                      {insp.total_hazards > 0 && (
                        <span className="text-xs text-amber-600 flex items-center gap-0.5">
                          <AlertTriangle className="w-3 h-3" />
                          {insp.total_hazards}件
                          {insp.critical_count > 0 && (
                            <span className="text-rose-600">（重大{insp.critical_count}件）</span>
                          )}
                        </span>
                      )}
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-300" />
                </div>
              </Link>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
