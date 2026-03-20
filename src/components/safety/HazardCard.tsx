"use client"

import { useState } from "react"
import { AlertTriangle, ChevronDown, ChevronUp, Scale, Wrench } from "lucide-react"
import type { SafetyHazard } from "@/lib/gemini-safety"

interface HazardCardProps {
  hazard: SafetyHazard
  index: number
  onSelect?: () => void
  isSelected?: boolean
}

const SEVERITY_STYLES = {
  critical: { bg: 'bg-rose-50', border: 'border-rose-300', badge: 'bg-rose-600 text-white', label: '重大' },
  high: { bg: 'bg-amber-50', border: 'border-amber-300', badge: 'bg-amber-500 text-white', label: '高' },
  medium: { bg: 'bg-blue-50', border: 'border-blue-200', badge: 'bg-blue-500 text-white', label: '中' },
  low: { bg: 'bg-slate-50', border: 'border-slate-200', badge: 'bg-slate-500 text-white', label: '低' },
}

/**
 * 個別ハザードの表示カード
 * 重篤度に応じた色分け、法令参照の展開表示
 */
export default function HazardCard({ hazard, index, onSelect, isSelected }: HazardCardProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const style = SEVERITY_STYLES[hazard.severity] || SEVERITY_STYLES.medium

  return (
    <div
      id={`hazard-${index}`}
      className={`rounded-xl border-2 overflow-hidden transition-all ${style.border} ${style.bg} ${
        isSelected ? 'ring-2 ring-blue-500 shadow-md' : ''
      }`}
      onClick={onSelect}
    >
      {/* ヘッダー */}
      <div className="px-4 py-3 flex items-start gap-3">
        <div className="flex items-center gap-2 shrink-0">
          <AlertTriangle className={`w-4 h-4 ${
            hazard.severity === 'critical' ? 'text-rose-600' :
            hazard.severity === 'high' ? 'text-amber-600' :
            hazard.severity === 'medium' ? 'text-blue-600' : 'text-slate-500'
          }`} />
          <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${style.badge}`}>
            {style.label}
          </span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-medium text-slate-500 bg-white/60 px-2 py-0.5 rounded-full">
              {hazard.category}
            </span>
          </div>
          <p className="text-sm font-medium text-slate-900 leading-relaxed">
            {hazard.description}
          </p>
        </div>
      </div>

      {/* 法令・改善提案（展開式） */}
      <button
        onClick={(e) => { e.stopPropagation(); setIsExpanded(!isExpanded) }}
        className="w-full px-4 py-2 flex items-center justify-between text-xs font-medium text-slate-500 hover:bg-white/50 transition-colors border-t border-white/50"
      >
        <span className="flex items-center gap-1">
          <Scale className="w-3 h-3" />
          法令根拠・改善提案
        </span>
        {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
      </button>

      {isExpanded && (
        <div className="px-4 pb-3 space-y-2">
          {/* 法令参照 */}
          {hazard.law_reference && (
            <div className="bg-white/70 rounded-lg p-3">
              <p className="text-xs font-bold text-slate-700 flex items-center gap-1 mb-1">
                <Scale className="w-3 h-3" />
                {hazard.law_reference}
              </p>
              {hazard.law_detail && (
                <p className="text-xs text-slate-600 leading-relaxed">{hazard.law_detail}</p>
              )}
            </div>
          )}

          {/* 改善提案 */}
          {hazard.recommendation && (
            <div className="bg-white/70 rounded-lg p-3">
              <p className="text-xs font-bold text-emerald-700 flex items-center gap-1 mb-1">
                <Wrench className="w-3 h-3" />
                改善提案
              </p>
              <p className="text-xs text-slate-600 leading-relaxed">{hazard.recommendation}</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
