"use client"

import { useState, useEffect, useCallback } from "react"
import { getActivityLogs } from "@/app/actions/activityLogs"
import { RefreshCw, Filter, FileText, CreditCard, Building2, Briefcase, ArrowRight, ChevronLeft, ChevronRight } from "lucide-react"
import Link from "next/link"

const ACTION_TYPE_LABELS: Record<string, { label: string; color: string; icon: any }> = {
    deal_created:       { label: '商談作成', color: 'bg-blue-100 text-blue-700', icon: Briefcase },
    deal_updated:       { label: '商談更新', color: 'bg-slate-100 text-slate-700', icon: Briefcase },
    company_created:    { label: '企業作成', color: 'bg-purple-100 text-purple-700', icon: Building2 },
    invoice_created:    { label: '請求書発行', color: 'bg-emerald-100 text-emerald-700', icon: FileText },
    quotation_created:  { label: '見積書発行', color: 'bg-teal-100 text-teal-700', icon: FileText },
    payment_confirmed:  { label: '入金確認', color: 'bg-green-100 text-green-700', icon: CreditCard },
    freee_synced:       { label: 'freee同期', color: 'bg-indigo-100 text-indigo-700', icon: ArrowRight },
    freee_unlinked:     { label: 'freee連携解除', color: 'bg-amber-100 text-amber-700', icon: ArrowRight },
    freee_import:       { label: 'freeeインポート', color: 'bg-cyan-100 text-cyan-700', icon: ArrowRight },
}

const PER_PAGE = 30

export default function ActivityLogsPage() {
    const [logs, setLogs] = useState<any[]>([])
    const [total, setTotal] = useState(0)
    const [isLoading, setIsLoading] = useState(true)
    const [filter, setFilter] = useState('all')
    const [page, setPage] = useState(0)

    const fetchLogs = useCallback(async () => {
        setIsLoading(true)
        try {
            const result = await getActivityLogs({
                action_type: filter,
                limit: PER_PAGE,
                offset: page * PER_PAGE,
            })
            setLogs(result.logs)
            setTotal(result.count)
        } catch (e) {
            console.error(e)
        } finally {
            setIsLoading(false)
        }
    }, [filter, page])

    useEffect(() => { fetchLogs() }, [fetchLogs])

    const totalPages = Math.ceil(total / PER_PAGE)

    return (
        <div className="space-y-6 pb-10">
            {/* 固定ヘッダー部分 */}
            <div className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur-sm -mx-4 md:-mx-8 px-4 md:px-8 pb-4 space-y-4">
                {/* ヘッダー */}
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                        <h1 className="text-2xl font-bold text-slate-900">活動ログ</h1>
                        <p className="text-sm text-slate-500 mt-1">システム上のすべてのアクション履歴を確認できます</p>
                    </div>
                    <button onClick={fetchLogs} disabled={isLoading} className="px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-50 transition-colors shadow-sm flex items-center gap-2">
                        <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
                        更新
                    </button>
                </div>

                {/* フィルター */}
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4">
                    <div className="flex items-center gap-2 flex-wrap">
                        <Filter className="w-4 h-4 text-slate-400" />
                        <button onClick={() => { setFilter('all'); setPage(0); }} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${filter === 'all' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                            すべて
                        </button>
                        {Object.entries(ACTION_TYPE_LABELS).map(([key, { label }]) => (
                            <button key={key} onClick={() => { setFilter(key); setPage(0); }} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${filter === key ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                                {label}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* ログ一覧 */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                {isLoading ? (
                    <div className="p-12 text-center">
                        <RefreshCw className="w-8 h-8 text-blue-600 animate-spin mx-auto mb-3" />
                        <p className="text-sm text-slate-500">読み込み中...</p>
                    </div>
                ) : logs.length === 0 ? (
                    <div className="p-12 text-center text-sm text-slate-500">該当する活動ログはありません</div>
                ) : (
                    <div className="divide-y divide-slate-100">
                        {logs.map((log) => {
                            const typeInfo = ACTION_TYPE_LABELS[log.action_type] || { label: log.action_type, color: 'bg-slate-100 text-slate-600', icon: ArrowRight }
                            const Icon = typeInfo.icon
                            return (
                                <div key={log.id} className="p-4 hover:bg-slate-50 transition-colors flex items-start gap-4">
                                    <div className={`p-2 rounded-lg shrink-0 ${typeInfo.color}`}>
                                        <Icon className="w-4 h-4" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${typeInfo.color}`}>{typeInfo.label}</span>
                                            <span className="text-xs text-slate-400">{new Date(log.created_at).toLocaleString('ja-JP')}</span>
                                        </div>
                                        <p className="text-sm text-slate-800 font-medium">{log.description}</p>
                                        <div className="flex gap-3 mt-1.5 text-xs text-slate-500">
                                            {log.deals && (
                                                <Link href={`/deals/${log.deals.id}`} className="hover:text-blue-600 hover:underline">
                                                    商談: {log.deals.title}
                                                </Link>
                                            )}
                                            {log.companies && (
                                                <Link href={`/companies/${log.companies.id}`} className="hover:text-blue-600 hover:underline">
                                                    企業: {log.companies.name}
                                                </Link>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                )}

                {/* ページネーション */}
                {!isLoading && totalPages > 1 && (
                    <div className="p-4 border-t border-slate-200 bg-slate-50 flex justify-between items-center text-sm text-slate-500">
                        <span>全 {total} 件中 {page * PER_PAGE + 1} - {Math.min((page + 1) * PER_PAGE, total)} 件</span>
                        <div className="flex gap-2">
                            <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} className="px-3 py-1.5 border border-slate-200 rounded-lg bg-white hover:bg-slate-50 disabled:opacity-50 flex items-center gap-1"><ChevronLeft className="w-4 h-4" />前</button>
                            <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1} className="px-3 py-1.5 border border-slate-200 rounded-lg bg-white hover:bg-slate-50 disabled:opacity-50 flex items-center gap-1">次<ChevronRight className="w-4 h-4" /></button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}
