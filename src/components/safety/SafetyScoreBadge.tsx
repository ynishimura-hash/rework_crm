"use client"

interface SafetyScoreBadgeProps {
  score: number | null
  size?: 'sm' | 'md' | 'lg'
}

/**
 * 安全スコアの円形バッジ表示
 * 80-100: 良好(emerald), 60-79: 注意(amber), 0-59: 危険(rose)
 */
export default function SafetyScoreBadge({ score, size = 'md' }: SafetyScoreBadgeProps) {
  if (score === null || score === undefined) {
    return (
      <div className={`
        ${size === 'sm' ? 'w-10 h-10 text-xs' : size === 'md' ? 'w-14 h-14 text-sm' : 'w-20 h-20 text-lg'}
        rounded-full bg-slate-100 flex items-center justify-center text-slate-400 font-bold
      `}>
        --
      </div>
    )
  }

  const getColor = (s: number) => {
    if (s >= 80) return { bg: 'bg-emerald-100', text: 'text-emerald-700', ring: 'ring-emerald-300', label: '良好' }
    if (s >= 60) return { bg: 'bg-amber-100', text: 'text-amber-700', ring: 'ring-amber-300', label: '注意' }
    return { bg: 'bg-rose-100', text: 'text-rose-700', ring: 'ring-rose-300', label: '危険' }
  }

  const color = getColor(score)

  return (
    <div className="flex flex-col items-center gap-1">
      <div className={`
        ${size === 'sm' ? 'w-10 h-10' : size === 'md' ? 'w-14 h-14' : 'w-20 h-20'}
        ${color.bg} ${color.text}
        rounded-full flex items-center justify-center font-bold ring-2 ${color.ring}
        ${size === 'sm' ? 'text-sm' : size === 'md' ? 'text-lg' : 'text-2xl'}
      `}>
        {score}
      </div>
      {size !== 'sm' && (
        <span className={`text-xs font-medium ${color.text}`}>{color.label}</span>
      )}
    </div>
  )
}
