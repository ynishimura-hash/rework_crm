"use client"

import { useState, useEffect, useReducer, Suspense } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import {
  ArrowLeft, ShieldCheck, Loader2, Check, Camera, Cloud, Sun,
  CloudRain, CloudSnow, AlertTriangle
} from "lucide-react"
import Link from "next/link"
import PhotoCapture from "@/components/safety/PhotoCapture"
import HazardOverlay from "@/components/safety/HazardOverlay"
import HazardCard from "@/components/safety/HazardCard"
import SafetyScoreBadge from "@/components/safety/SafetyScoreBadge"
import type { SafetyHazard, SafetyAnalysisResult } from "@/lib/gemini-safety"

// 写真ごとの分析結果を管理する型
interface PhotoAnalysis {
  image: string
  location: string
  result: SafetyAnalysisResult | null
  isAnalyzing: boolean
  error: string | null
}

type Action =
  | { type: 'ADD_PHOTO'; image: string }
  | { type: 'SET_ANALYZING'; index: number }
  | { type: 'SET_RESULT'; index: number; result: SafetyAnalysisResult }
  | { type: 'SET_ERROR'; index: number; error: string }
  | { type: 'SET_LOCATION'; index: number; location: string }
  | { type: 'REMOVE_PHOTO'; index: number }

function photoReducer(state: PhotoAnalysis[], action: Action): PhotoAnalysis[] {
  switch (action.type) {
    case 'ADD_PHOTO':
      return [...state, { image: action.image, location: '', result: null, isAnalyzing: false, error: null }]
    case 'SET_ANALYZING':
      return state.map((p, i) => i === action.index ? { ...p, isAnalyzing: true, error: null } : p)
    case 'SET_RESULT':
      return state.map((p, i) => i === action.index ? { ...p, result: action.result, isAnalyzing: false } : p)
    case 'SET_ERROR':
      return state.map((p, i) => i === action.index ? { ...p, error: action.error, isAnalyzing: false } : p)
    case 'SET_LOCATION':
      return state.map((p, i) => i === action.index ? { ...p, location: action.location } : p)
    case 'REMOVE_PHOTO':
      return state.filter((_, i) => i !== action.index)
    default:
      return state
  }
}

interface SiteOption {
  id: string
  name: string
}

const WEATHER_OPTIONS = [
  { value: '晴れ', icon: Sun, label: '晴れ' },
  { value: '曇り', icon: Cloud, label: '曇り' },
  { value: '雨', icon: CloudRain, label: '雨' },
  { value: '雪', icon: CloudSnow, label: '雪' },
]

export default function SafetyInspectPageWrapper() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-br from-emerald-50 to-teal-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" />
      </div>
    }>
      <SafetyInspectPage />
    </Suspense>
  )
}

function SafetyInspectPage() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const preselectedSiteId = searchParams.get('siteId') || ''

  // フォーム状態
  const [siteId, setSiteId] = useState(preselectedSiteId)
  const [sites, setSites] = useState<SiteOption[]>([])
  const [inspectorName, setInspectorName] = useState('')
  const [weather, setWeather] = useState('晴れ')
  const [inspectionDate, setInspectionDate] = useState(
    new Date().toISOString().split('T')[0]
  )

  // 写真・分析状態
  const [photos, dispatch] = useReducer(photoReducer, [])
  const [selectedHazardIndex, setSelectedHazardIndex] = useState<number | undefined>()

  // 保存状態
  const [isSaving, setIsSaving] = useState(false)
  const [saveComplete, setSaveComplete] = useState(false)
  const [savedInspectionId, setSavedInspectionId] = useState<string | null>(null)

  // 現場一覧を取得
  useEffect(() => {
    fetch('/api/safety/sites')
      .then(res => res.json())
      .then(data => setSites(data || []))
      .catch(() => {})
  }, [])

  // 写真撮影時にAI分析を自動実行
  const handleAnalyze = async (image: string) => {
    const index = photos.length // 新しく追加される写真のインデックス
    dispatch({ type: 'ADD_PHOTO', image })

    // 少し待ってからstateが更新された後に分析開始
    setTimeout(async () => {
      dispatch({ type: 'SET_ANALYZING', index })
      try {
        const res = await fetch('/api/safety/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image }),
        })
        if (!res.ok) throw new Error('分析に失敗しました')
        const result: SafetyAnalysisResult = await res.json()
        dispatch({ type: 'SET_RESULT', index, result })
      } catch (err) {
        dispatch({ type: 'SET_ERROR', index, error: '分析に失敗しました。再度お試しください。' })
      }
    }, 100)
  }

  // 全ハザードを集計
  const allHazards = photos.flatMap(p => p.result?.hazards || [])
  const isAnyAnalyzing = photos.some(p => p.isAnalyzing)
  const hasResults = photos.some(p => p.result !== null)

  // 全体スコア計算
  const overallScore = hasResults
    ? Math.round(photos.filter(p => p.result).reduce((sum, p) => sum + (p.result?.score || 0), 0) / photos.filter(p => p.result).length)
    : null

  // 点検結果を保存
  const handleSave = async () => {
    if (!siteId || !inspectorName) {
      alert('現場と点検者名を入力してください')
      return
    }

    setIsSaving(true)
    try {
      // 1. 点検レコード作成
      const inspRes = await fetch('/api/safety/inspections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          site_id: siteId,
          inspector_name: inspectorName,
          inspection_date: inspectionDate,
          weather,
        }),
      })
      if (!inspRes.ok) throw new Error('点検レコードの作成に失敗')
      const inspection = await inspRes.json()

      // 2. 各写真とハザードを保存
      for (const photo of photos) {
        if (!photo.result) continue

        const photoRes = await fetch('/api/safety/photos', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            inspection_id: inspection.id,
            photo_url: photo.image,
            photo_location: photo.location || null,
            ai_raw_response: photo.result,
          }),
        })
        if (!photoRes.ok) continue
        const savedPhoto = await photoRes.json()

        // ハザードを保存
        if (photo.result.hazards.length > 0) {
          await fetch('/api/safety/hazards', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              hazards: photo.result.hazards.map(h => ({
                photo_id: savedPhoto.id,
                inspection_id: inspection.id,
                site_id: siteId,
                severity: h.severity,
                category: h.category,
                description: h.description,
                law_reference: h.law_reference || null,
                law_detail: h.law_detail || null,
                recommendation: h.recommendation || null,
                bbox_x: h.bbox?.x || null,
                bbox_y: h.bbox?.y || null,
                bbox_w: h.bbox?.w || null,
                bbox_h: h.bbox?.h || null,
              })),
            }),
          })
        }
      }

      // 3. 点検を完了に更新
      await fetch(`/api/safety/inspections/${inspection.id}/complete`, {
        method: 'POST',
      })

      setSaveComplete(true)
      setSavedInspectionId(inspection.id)
    } catch (err) {
      console.error('Save error:', err)
      alert('保存に失敗しました。再度お試しください。')
    } finally {
      setIsSaving(false)
    }
  }

  // 保存完了画面
  if (saveComplete) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-emerald-50 to-teal-50 flex flex-col items-center justify-center p-6">
        <div className="w-20 h-20 rounded-full bg-emerald-100 flex items-center justify-center mb-6">
          <Check className="w-10 h-10 text-emerald-600" />
        </div>
        <h2 className="text-xl font-bold text-emerald-900 mb-2">点検完了</h2>
        <p className="text-sm text-emerald-700 text-center mb-2">
          {allHazards.length}件の危険箇所を記録しました
        </p>
        {overallScore !== null && (
          <div className="mb-6">
            <SafetyScoreBadge score={overallScore} size="lg" />
          </div>
        )}
        <div className="flex gap-3">
          <Link
            href="/safety"
            className="px-6 py-3 bg-white text-emerald-700 rounded-xl font-medium border border-emerald-200 hover:bg-emerald-50 transition-colors"
          >
            一覧に戻る
          </Link>
          <button
            onClick={() => {
              dispatch({ type: 'REMOVE_PHOTO', index: -1 }) // リセット
              setSaveComplete(false)
              setSavedInspectionId(null)
              window.location.reload()
            }}
            className="px-6 py-3 bg-emerald-600 text-white rounded-xl font-medium hover:bg-emerald-700 transition-colors"
          >
            続けて点検
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 to-teal-50">
      {/* ヘッダー */}
      <header className="sticky top-0 z-10 bg-white/80 backdrop-blur-md border-b border-emerald-200 px-4 py-3 flex items-center gap-3">
        <Link href="/safety" className="p-2 -ml-2 rounded-full hover:bg-emerald-100 transition-colors">
          <ArrowLeft className="w-5 h-5 text-emerald-700" />
        </Link>
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-emerald-600" />
          <h1 className="text-lg font-bold text-emerald-900">安全パトロール</h1>
        </div>
        {overallScore !== null && (
          <div className="ml-auto">
            <SafetyScoreBadge score={overallScore} size="sm" />
          </div>
        )}
      </header>

      <div className="p-4 max-w-lg mx-auto space-y-6">
        {/* 基本情報フォーム */}
        <div className="bg-white rounded-2xl border border-emerald-200 p-4 space-y-4">
          <h2 className="text-sm font-bold text-slate-700">点検情報</h2>

          {/* 現場選択 */}
          <div>
            <label className="text-xs font-medium text-slate-500">現場</label>
            <select
              value={siteId}
              onChange={e => setSiteId(e.target.value)}
              className="w-full mt-1 px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
            >
              <option value="">現場を選択...</option>
              {sites.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>

          {/* 点検者名 */}
          <div>
            <label className="text-xs font-medium text-slate-500">点検者名</label>
            <input
              type="text"
              value={inspectorName}
              onChange={e => setInspectorName(e.target.value)}
              placeholder="点検者名を入力"
              className="w-full mt-1 px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
            />
          </div>

          {/* 日付・天候 */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-slate-500">日付</label>
              <input
                type="date"
                value={inspectionDate}
                onChange={e => setInspectionDate(e.target.value)}
                className="w-full mt-1 px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500">天候</label>
              <div className="flex gap-1.5 mt-1">
                {WEATHER_OPTIONS.map(w => (
                  <button
                    key={w.value}
                    onClick={() => setWeather(w.value)}
                    className={`flex-1 py-2.5 rounded-xl text-xs font-medium flex flex-col items-center gap-0.5 transition-all ${
                      weather === w.value
                        ? 'bg-emerald-100 text-emerald-700 border-2 border-emerald-400'
                        : 'bg-slate-50 text-slate-500 border border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    <w.icon className="w-4 h-4" />
                    <span>{w.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* 写真撮影エリア */}
        <div className="bg-white rounded-2xl border border-emerald-200 p-4 space-y-4">
          <h2 className="text-sm font-bold text-slate-700 flex items-center gap-2">
            <Camera className="w-4 h-4 text-emerald-600" />
            現場写真
            {photos.length > 0 && (
              <span className="text-xs font-normal text-slate-400">({photos.length}枚)</span>
            )}
          </h2>

          <PhotoCapture
            images={photos.map(p => p.image)}
            onImagesChange={() => {}}
            isAnalyzing={isAnyAnalyzing}
            onAnalyze={handleAnalyze}
          />
        </div>

        {/* 分析結果 */}
        {photos.map((photo, photoIndex) => (
          <div key={photoIndex} className="space-y-3">
            {/* 分析中インジケーター */}
            {photo.isAnalyzing && (
              <div className="bg-white rounded-2xl border border-emerald-200 p-6 flex flex-col items-center gap-3">
                <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" />
                <p className="text-sm font-medium text-emerald-700">
                  写真 {photoIndex + 1} をAIが分析中...
                </p>
                <p className="text-xs text-slate-500">安全基準・法令と照合しています</p>
              </div>
            )}

            {/* エラー */}
            {photo.error && (
              <div className="bg-rose-50 rounded-2xl border border-rose-200 p-4 text-center">
                <p className="text-sm text-rose-700">{photo.error}</p>
                <button
                  onClick={() => handleAnalyze(photo.image)}
                  className="mt-2 px-4 py-2 bg-rose-600 text-white rounded-lg text-xs font-medium"
                >
                  再分析
                </button>
              </div>
            )}

            {/* 分析結果の表示 */}
            {photo.result && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 px-1">
                  <span className="text-xs font-bold text-slate-500">写真 {photoIndex + 1} の分析結果</span>
                  <SafetyScoreBadge score={photo.result.score} size="sm" />
                  {photo.result.hazards.length > 0 && (
                    <span className="ml-auto text-xs text-slate-500">
                      {photo.result.hazards.length}件の指摘
                    </span>
                  )}
                </div>

                {/* 写真 + オーバーレイ */}
                <HazardOverlay
                  imageUrl={photo.image}
                  hazards={photo.result.hazards}
                  selectedIndex={selectedHazardIndex}
                  onSelectHazard={setSelectedHazardIndex}
                />

                {/* 撮影箇所メモ */}
                <input
                  type="text"
                  value={photo.location}
                  onChange={e => dispatch({ type: 'SET_LOCATION', index: photoIndex, location: e.target.value })}
                  placeholder="撮影箇所（例：3階足場周辺）"
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                />

                {/* 総合所見 */}
                {photo.result.overall_assessment && (
                  <div className="bg-slate-50 rounded-xl p-3">
                    <p className="text-xs text-slate-600 leading-relaxed">{photo.result.overall_assessment}</p>
                  </div>
                )}

                {/* ハザードカード一覧 */}
                <div className="space-y-2">
                  {photo.result.hazards.map((hazard, hIndex) => (
                    <HazardCard
                      key={hIndex}
                      hazard={hazard}
                      index={hIndex}
                      isSelected={selectedHazardIndex === hIndex}
                      onSelect={() => setSelectedHazardIndex(hIndex)}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}

        {/* AI免責事項 */}
        {hasResults && (
          <div className="bg-amber-50 rounded-xl border border-amber-200 px-4 py-3 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-700 leading-relaxed">
              AI生成の法令参照は参考情報です。最新の法令を必ず確認してください。
            </p>
          </div>
        )}

        {/* 保存ボタン */}
        {hasResults && !isAnyAnalyzing && (
          <button
            onClick={handleSave}
            disabled={isSaving || !siteId || !inspectorName}
            className="w-full py-4 bg-emerald-600 text-white rounded-2xl font-bold text-base hover:bg-emerald-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/20"
          >
            {isSaving ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                保存中...
              </>
            ) : (
              <>
                <ShieldCheck className="w-5 h-5" />
                点検結果を保存（{allHazards.length}件の指摘）
              </>
            )}
          </button>
        )}

        {/* 下部余白 */}
        <div className="h-8" />
      </div>
    </div>
  )
}
