"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { getDeals, createDeal } from "@/app/actions/deals"
import CreateDealModal from "@/components/deals/CreateDealModal"
import { Briefcase, Search, Plus, Filter, Download, Calendar, LayoutGrid, List, RefreshCw, Eye, Trash2 } from "lucide-react"
import ContextMenu from "@/components/ui/ContextMenu"
import DeleteConfirmDialog from "@/components/ui/DeleteConfirmDialog"
import { deleteDeal } from "@/app/actions/deals"

export default function DealsPage() {
    const router = useRouter()
    const [currentPage, setCurrentPage] = useState(1)
    const [allDeals, setAllDeals] = useState<any[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [isSyncing, setIsSyncing] = useState(false)
    const [isSyncingAll, setIsSyncingAll] = useState(false)
    const [isModalOpen, setIsModalOpen] = useState(false)
    const [searchQuery, setSearchQuery] = useState("")
    const [viewMode, setViewMode] = useState<'table' | 'card'>('table')
    const [deleteTarget, setDeleteTarget] = useState<{ id: string; title: string } | null>(null)

    const handleDeleteDeal = async () => {
        if (!deleteTarget) return
        await deleteDeal(deleteTarget.id)
        setAllDeals(prev => prev.filter(d => d.id !== deleteTarget.id))
        setDeleteTarget(null)
    }

    useEffect(() => {
        getDeals().then(data => {
            setAllDeals(data || [])
            setIsLoading(false)
        })
        const mql = window.matchMedia('(max-width: 768px)')
        if (mql.matches) setViewMode('card')
        const handler = (e: MediaQueryListEvent) => setViewMode(e.matches ? 'card' : 'table')
        mql.addEventListener('change', handler)
        return () => mql.removeEventListener('change', handler)
    }, [])

    const handleCreateDeal = async (formData: FormData) => {
        await createDeal(formData)
        const updatedDeals = await getDeals()
        setAllDeals(updatedDeals || [])
    }

    const handleSyncFreee = async () => {
        setIsSyncing(true)
        try {
            const res = await fetch('/api/freee/sync-latest-paid', { method: 'POST' })
            if (res.status === 401) {
                if (window.confirm('freeeの認証情報が有効ではありません。再認証画面へ移動しますか？')) {
                    router.push('/api/freee/auth')
                }
                return
            }
            const data = await res.json()
            if (data.success) {
                alert(data.message)
                const updatedDeals = await getDeals()
                setAllDeals(updatedDeals || [])
            } else {
                alert(data.message || '同期に失敗しました。')
            }
        } catch {
            alert('通信エラーが発生しました。')
        } finally {
            setIsSyncing(false)
        }
    }

    const handleSyncAllFreee = async () => {
        if (!window.confirm('freeeの全書類（請求書・見積書）を一括インポートします。\n処理に時間がかかる場合があります。実行しますか？')) return
        setIsSyncingAll(true)
        try {
            const res = await fetch('/api/freee/sync-all')
            if (res.status === 401) {
                if (window.confirm('freeeの認証情報が有効ではありません。再認証画面へ移動しますか？')) {
                    router.push('/api/freee/auth')
                }
                return
            }
            const data = await res.json()
            if (data.success) {
                const s = data.summary
                alert(`一括インポート完了\n\n請求書: ${s.invoices_imported || 0}件インポート（スキップ: ${s.invoices_skipped || 0}件）\n見積書: ${s.quotations_imported || 0}件インポート（スキップ: ${s.quotations_skipped || 0}件）`)
                const updatedDeals = await getDeals()
                setAllDeals(updatedDeals || [])
            } else {
                alert(data.error || '一括同期に失敗しました。')
            }
        } catch {
            alert('通信エラーが発生しました。')
        } finally {
            setIsSyncingAll(false)
        }
    }

    const filteredDeals = searchQuery
        ? allDeals.filter((d: any) =>
            d.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            d.companies?.name?.toLowerCase().includes(searchQuery.toLowerCase())
        )
        : allDeals

    const itemsPerPage = 20
    const totalPages = Math.ceil(filteredDeals.length / itemsPerPage) || 1
    const startIndex = (currentPage - 1) * itemsPerPage
    const currentDeals = filteredDeals.slice(startIndex, startIndex + itemsPerPage)

    return (
        <div className="space-y-6">
            {/* 固定ヘッダー部分 */}
            <div className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur-sm -mx-4 md:-mx-8 px-4 md:px-8 pb-4 space-y-4">
                {/* ページヘッダー */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                            <Briefcase className="w-6 h-6 text-blue-600" />
                            商談・案件
                        </h1>
                        <p className="text-sm text-slate-500 mt-1">全{filteredDeals.length}件の商談情報を管理します。</p>
                    </div>
                    {isLoading && <div className="text-sm text-blue-600 animate-pulse">データを読み込み中...</div>}
                    <div className="flex items-center gap-2 flex-wrap">
                        <button onClick={() => router.push('/api/freee/auth')} className="hidden sm:flex items-center gap-2 px-3 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors shadow-sm">
                            <Briefcase className="w-4 h-4" />
                            freee認証
                        </button>
                        <button onClick={handleSyncAllFreee} disabled={isSyncingAll} className="flex items-center gap-2 px-3 py-2.5 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 transition-colors shadow-sm disabled:opacity-50">
                            <RefreshCw className={`w-4 h-4 ${isSyncingAll ? 'animate-spin' : ''}`} />
                            {isSyncingAll ? 'インポート中...' : 'freee一括同期'}
                        </button>
                        <button onClick={handleSyncFreee} disabled={isSyncing} className="flex items-center gap-2 px-3 py-2.5 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 transition-colors shadow-sm disabled:opacity-50">
                            <Download className={`w-4 h-4 ${isSyncing ? 'animate-bounce' : ''}`} />
                            {isSyncing ? '同期中...' : '入金取得'}
                        </button>
                        <button onClick={() => setIsModalOpen(true)} className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors shadow-sm">
                            <Plus className="w-4 h-4" />
                            新規商談
                        </button>
                    </div>
                </div>

                {/* フィルター & 検索バー */}
                <div className="bg-white p-3 md:p-4 rounded-xl shadow-sm border border-slate-200 flex flex-col sm:flex-row gap-3 justify-between items-center">
                    <div className="relative flex-1 w-full max-w-md">
                        <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                        <input
                            type="text"
                            placeholder="案件名、企業名で検索..."
                            value={searchQuery}
                            onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1) }}
                            className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all placeholder:text-slate-400"
                        />
                    </div>
                    <div className="flex items-center gap-2 w-full sm:w-auto">
                        <button className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-3 py-2 bg-white border border-slate-200 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-50 transition-colors">
                            <Filter className="w-4 h-4" />
                            絞り込み
                        </button>
                        <div className="flex border border-slate-200 rounded-lg overflow-hidden">
                            <button onClick={() => setViewMode('table')} className={`p-2 ${viewMode === 'table' ? 'bg-blue-50 text-blue-600' : 'bg-white text-slate-400 hover:bg-slate-50'}`}>
                                <List className="w-4 h-4" />
                            </button>
                            <button onClick={() => setViewMode('card')} className={`p-2 ${viewMode === 'card' ? 'bg-blue-50 text-blue-600' : 'bg-white text-slate-400 hover:bg-slate-50'}`}>
                                <LayoutGrid className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {viewMode === 'table' ? (
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-slate-200">
                            <thead className="bg-slate-50/50">
                                <tr>
                                    <th className="px-3 md:px-6 py-3.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider w-1/3">商談タイトル</th>
                                    <th className="px-3 md:px-6 py-3.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider hidden sm:table-cell">企業・担当者</th>
                                    <th className="px-3 md:px-6 py-3.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">金額</th>
                                    <th className="px-3 md:px-6 py-3.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider hidden md:table-cell">ステータス</th>
                                    <th className="px-3 md:px-6 py-3.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider hidden lg:table-cell">次回アポ日</th>
                                    <th className="relative px-3 md:px-6 py-3.5"><span className="sr-only">アクション</span></th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 bg-white">
                                {currentDeals.map((deal: any) => (
                                    <tr key={deal.id} onClick={() => router.push(`/deals/${deal.id}`)} className="hover:bg-slate-50/80 transition-colors cursor-pointer group">
                                        <td className="px-3 md:px-6 py-4">
                                            <div className="flex items-start">
                                                <div className="h-10 w-10 shrink-0 rounded-lg bg-gradient-to-br from-indigo-50 to-blue-50 border border-indigo-100 flex items-center justify-center mt-1">
                                                    <Briefcase className="h-5 w-5 text-indigo-600" />
                                                </div>
                                                <div className="ml-3 md:ml-4 min-w-0 flex-1">
                                                    <div className="text-sm font-semibold text-slate-900 line-clamp-2">{deal.title}</div>
                                                    <div className="text-xs text-slate-500 mt-1 flex items-center gap-1">
                                                        <Calendar className="w-3.5 h-3.5 shrink-0" />
                                                        {deal.close_date ? new Date(deal.close_date).toLocaleDateString('ja-JP') : '未定'}
                                                    </div>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-3 md:px-6 py-4 whitespace-nowrap hidden sm:table-cell">
                                            <div className="text-sm font-medium text-slate-900 truncate">{deal.companies?.name || '不明'}</div>
                                            <div className="text-xs text-slate-500 mt-0.5 truncate">{deal.contacts?.name || '担当者未設定'}</div>
                                        </td>
                                        <td className="px-3 md:px-6 py-4 whitespace-nowrap text-sm font-bold text-slate-900">
                                            {deal.estimated_amount ? `¥${deal.estimated_amount.toLocaleString()}` : '-'}
                                        </td>
                                        <td className="px-3 md:px-6 py-4 whitespace-nowrap hidden md:table-cell">
                                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${
                                                deal.status === '成約' || deal.status === '入金確認完了' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                                                deal.status === '失注' ? 'bg-slate-50 text-slate-600 border-slate-200' :
                                                deal.status === '請求書発行' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                                                deal.status === '見積提出済' ? 'bg-purple-50 text-purple-700 border-purple-200' :
                                                deal.status?.includes('提案') ? 'bg-indigo-50 text-indigo-700 border-indigo-200' :
                                                'bg-blue-50 text-blue-700 border-blue-200'
                                            }`}>
                                                {deal.status}
                                            </span>
                                        </td>
                                        <td className="px-3 md:px-6 py-4 whitespace-nowrap hidden lg:table-cell">
                                            <div className="text-sm text-slate-600 flex items-center gap-1">
                                                <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                                {deal.next_appointment_date ? new Date(deal.next_appointment_date).toLocaleDateString('ja-JP') : '-'}
                                            </div>
                                        </td>
                                        <td className="px-3 md:px-6 py-4 whitespace-nowrap text-right">
                                            <ContextMenu items={[
                                                { label: "詳細を見る", icon: <Eye className="w-4 h-4" />, onClick: () => router.push(`/deals/${deal.id}`) },
                                                { label: "削除", icon: <Trash2 className="w-4 h-4" />, variant: "danger", onClick: () => setDeleteTarget({ id: deal.id, title: deal.title }) },
                                            ]} />
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <div className="px-4 md:px-6 py-4 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between">
                        <p className="text-sm text-slate-500">全{filteredDeals.length}件中 {filteredDeals.length > 0 ? startIndex + 1 : 0}-{Math.min(startIndex + itemsPerPage, filteredDeals.length)}件</p>
                        <div className="flex gap-1">
                            <button disabled={currentPage === 1} onClick={() => setCurrentPage(p => Math.max(1, p - 1))} className="px-3 py-1 text-sm border border-slate-200 rounded-md bg-white text-slate-500 hover:bg-slate-50 disabled:opacity-50">前へ</button>
                            <button className="px-3 py-1 text-sm border border-blue-200 rounded-md bg-white text-blue-600 font-medium min-w-[2rem]">{currentPage}</button>
                            <span className="px-2 py-1 text-slate-400">/ {totalPages}</span>
                            <button disabled={currentPage >= totalPages} onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} className="px-3 py-1 text-sm border border-slate-200 rounded-md bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-50">次へ</button>
                        </div>
                    </div>
                </div>
            ) : (
                <div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {currentDeals.map((deal: any) => (
                            <div
                                key={deal.id}
                                onClick={() => router.push(`/deals/${deal.id}`)}
                                className="bg-white rounded-xl border border-slate-200 p-4 hover:shadow-md transition-all cursor-pointer"
                            >
                                <div className="flex items-start gap-3 mb-3">
                                    <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-indigo-50 to-blue-50 border border-indigo-100 flex items-center justify-center shrink-0">
                                        <Briefcase className="h-5 w-5 text-indigo-600" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <h3 className="text-sm font-bold text-slate-900 line-clamp-2">{deal.title}</h3>
                                        <p className="text-xs text-slate-500 mt-1">{deal.companies?.name || '不明'}</p>
                                    </div>
                                    <ContextMenu items={[
                                        { label: "詳細を見る", icon: <Eye className="w-4 h-4" />, onClick: () => router.push(`/deals/${deal.id}`) },
                                        { label: "削除", icon: <Trash2 className="w-4 h-4" />, variant: "danger", onClick: () => setDeleteTarget({ id: deal.id, title: deal.title }) },
                                    ]} />
                                </div>
                                <div className="flex items-center justify-between">
                                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${
                                        deal.status === '成約' || deal.status === '入金確認完了' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                                        deal.status === '失注' ? 'bg-slate-50 text-slate-600 border-slate-200' :
                                        'bg-blue-50 text-blue-700 border-blue-200'
                                    }`}>
                                        {deal.status}
                                    </span>
                                    <span className="text-sm font-bold text-slate-900">
                                        {deal.estimated_amount ? `¥${deal.estimated_amount.toLocaleString()}` : '-'}
                                    </span>
                                </div>
                                <div className="flex items-center justify-between mt-2 text-xs text-slate-500">
                                    <div className="flex items-center gap-1">
                                        <Calendar className="w-3 h-3" />
                                        {deal.close_date ? new Date(deal.close_date).toLocaleDateString('ja-JP') : '未定'}
                                    </div>
                                    {deal.next_appointment_date && (
                                        <div className="flex items-center gap-1 text-blue-600">
                                            <Calendar className="w-3 h-3" />
                                            <span>次回: {new Date(deal.next_appointment_date).toLocaleDateString('ja-JP')}</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                    <div className="mt-4 flex items-center justify-between">
                        <p className="text-sm text-slate-500">全{filteredDeals.length}件中 {filteredDeals.length > 0 ? startIndex + 1 : 0}-{Math.min(startIndex + itemsPerPage, filteredDeals.length)}件</p>
                        <div className="flex gap-1">
                            <button disabled={currentPage === 1} onClick={() => setCurrentPage(p => Math.max(1, p - 1))} className="px-3 py-1 text-sm border border-slate-200 rounded-md bg-white text-slate-500 hover:bg-slate-50 disabled:opacity-50">前へ</button>
                            <button className="px-3 py-1 text-sm border border-blue-200 rounded-md bg-white text-blue-600 font-medium">{currentPage}</button>
                            <span className="px-2 py-1 text-slate-400">/ {totalPages}</span>
                            <button disabled={currentPage >= totalPages} onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} className="px-3 py-1 text-sm border border-slate-200 rounded-md bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-50">次へ</button>
                        </div>
                    </div>
                </div>
            )}

            <CreateDealModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} onSubmit={handleCreateDeal} />

            {/* 削除確認ダイアログ */}
            {deleteTarget && (
                <DeleteConfirmDialog
                    title="商談を削除"
                    message={`「${deleteTarget.title}」を削除しますか？関連する議事録・入金記録も削除されます。`}
                    onConfirm={handleDeleteDeal}
                    onCancel={() => setDeleteTarget(null)}
                />
            )}
        </div>
    )
}
