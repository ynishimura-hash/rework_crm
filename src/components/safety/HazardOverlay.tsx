"use client"

import type { SafetyHazard } from "@/lib/gemini-safety"

interface HazardOverlayProps {
  imageUrl: string
  hazards: SafetyHazard[]
  selectedIndex?: number
  onSelectHazard?: (index: number) => void
}

const SEVERITY_COLORS = {
  critical: { border: 'border-rose-500', bg: 'bg-rose-500', text: 'text-white' },
  high: { border: 'border-amber-500', bg: 'bg-amber-500', text: 'text-white' },
  medium: { border: 'border-blue-500', bg: 'bg-blue-500', text: 'text-white' },
  low: { border: 'border-slate-400', bg: 'bg-slate-400', text: 'text-white' },
}

/**
 * 写真上にハザードのバウンディングボックスを重畳表示
 * タップでHazardCardへスクロール
 */
export default function HazardOverlay({
  imageUrl,
  hazards,
  selectedIndex,
  onSelectHazard,
}: HazardOverlayProps) {
  return (
    <div className="relative w-full rounded-xl overflow-hidden border border-slate-200">
      <img src={imageUrl} alt="現場写真" className="w-full h-auto" />

      {/* バウンディングボックスの重畳 */}
      {hazards.map((hazard, index) => {
        if (!hazard.bbox) return null
        const color = SEVERITY_COLORS[hazard.severity] || SEVERITY_COLORS.medium
        const isSelected = selectedIndex === index

        return (
          <button
            key={index}
            onClick={() => {
              onSelectHazard?.(index)
              // 対応するHazardCardへスクロール
              const el = document.getElementById(`hazard-${index}`)
              el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
            }}
            className={`absolute ${color.border} border-2 rounded-sm transition-all cursor-pointer
              ${isSelected ? 'border-4 shadow-lg' : 'opacity-80 hover:opacity-100'}
            `}
            style={{
              left: `${hazard.bbox.x * 100}%`,
              top: `${hazard.bbox.y * 100}%`,
              width: `${hazard.bbox.w * 100}%`,
              height: `${hazard.bbox.h * 100}%`,
            }}
          >
            {/* 番号ラベル */}
            <span className={`absolute -top-3 -left-1 ${color.bg} ${color.text} text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center shadow`}>
              {index + 1}
            </span>
          </button>
        )
      })}

      {/* ハザードなしの場合 */}
      {hazards.length === 0 && (
        <div className="absolute inset-0 bg-emerald-500/10 flex items-center justify-center">
          <span className="bg-emerald-600 text-white px-4 py-2 rounded-full text-sm font-bold shadow-lg">
            危険箇所なし
          </span>
        </div>
      )}
    </div>
  )
}
