import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, ShieldCheck, Calendar, User, Cloud, AlertTriangle } from "lucide-react"
import { getInspectionById } from "@/app/actions/safety"
import SafetyScoreBadge from "@/components/safety/SafetyScoreBadge"
import HazardOverlayClient from "./HazardOverlayClient"

export const dynamic = 'force-dynamic'

export default async function InspectionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const inspection = await getInspectionById(id)

  if (!inspection) {
    notFound()
  }

  const site = (inspection as any).safety_sites
  const photos = (inspection as any).safety_inspection_photos || []

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 to-teal-50">
      <header className="sticky top-0 z-10 bg-white/80 backdrop-blur-md border-b border-emerald-200 px-4 py-3 flex items-center gap-3">
        <Link
          href={site ? `/safety/sites/${site.id}` : '/safety'}
          className="p-2 -ml-2 rounded-full hover:bg-emerald-100 transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-emerald-700" />
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-bold text-emerald-900 truncate">点検結果</h1>
          {site && <p className="text-xs text-slate-500 truncate">{site.name}</p>}
        </div>
        <SafetyScoreBadge score={inspection.overall_score} size="sm" />
      </header>

      <div className="p-4 max-w-lg mx-auto space-y-4">
        {/* 概要 */}
        <div className="bg-white rounded-2xl border border-emerald-200 p-4">
          <div className="flex items-center justify-between mb-3">
            <SafetyScoreBadge score={inspection.overall_score} size="lg" />
            <div className="text-right space-y-1">
              <p className="text-sm text-slate-600 flex items-center gap-1 justify-end">
                <Calendar className="w-3.5 h-3.5" />
                {inspection.inspection_date}
              </p>
              <p className="text-sm text-slate-600 flex items-center gap-1 justify-end">
                <User className="w-3.5 h-3.5" />
                {inspection.inspector_name}
              </p>
              {inspection.weather && (
                <p className="text-sm text-slate-600 flex items-center gap-1 justify-end">
                  <Cloud className="w-3.5 h-3.5" />
                  {inspection.weather}
                </p>
              )}
            </div>
          </div>

          {/* 統計 */}
          <div className="grid grid-cols-3 gap-2 mt-3">
            <div className="bg-slate-50 rounded-lg p-2 text-center">
              <p className="text-lg font-bold text-slate-900">{inspection.total_hazards || 0}</p>
              <p className="text-xs text-slate-500">指摘数</p>
            </div>
            <div className="bg-rose-50 rounded-lg p-2 text-center">
              <p className="text-lg font-bold text-rose-700">{inspection.critical_count || 0}</p>
              <p className="text-xs text-rose-500">重大</p>
            </div>
            <div className="bg-emerald-50 rounded-lg p-2 text-center">
              <p className="text-lg font-bold text-emerald-700">{photos.length}</p>
              <p className="text-xs text-emerald-500">写真</p>
            </div>
          </div>
        </div>

        {/* サマリー */}
        {inspection.summary && (
          <div className="bg-white rounded-2xl border border-emerald-200 p-4">
            <h2 className="text-sm font-bold text-slate-700 mb-2">所見</h2>
            <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-wrap">
              {inspection.summary}
            </p>
          </div>
        )}

        {/* 各写真の分析結果 */}
        {photos.map((photo: any, photoIndex: number) => (
          <div key={photo.id} className="space-y-3">
            <h3 className="text-sm font-bold text-slate-600 px-1">
              写真 {photoIndex + 1}
              {photo.photo_location && (
                <span className="font-normal text-slate-400 ml-2">({photo.photo_location})</span>
              )}
            </h3>

            <HazardOverlayClient
              imageUrl={photo.photo_url}
              hazards={(photo.safety_hazards || []).map((h: any) => ({
                severity: h.severity,
                category: h.category,
                description: h.description,
                law_reference: h.law_reference,
                law_detail: h.law_detail,
                recommendation: h.recommendation,
                bbox: h.bbox_x != null ? {
                  x: h.bbox_x,
                  y: h.bbox_y,
                  w: h.bbox_w,
                  h: h.bbox_h,
                } : null,
              }))}
            />
          </div>
        ))}

        {/* AI免責 */}
        {(inspection.total_hazards || 0) > 0 && (
          <div className="bg-amber-50 rounded-xl border border-amber-200 px-4 py-3 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-700 leading-relaxed">
              AI生成の法令参照は参考情報です。最新の法令を必ず確認してください。
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
