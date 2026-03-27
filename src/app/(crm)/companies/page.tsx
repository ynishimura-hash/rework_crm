"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { getCompanies } from "@/app/actions/companies"
import {
    Building2,
    Search,
    Plus,
    Download,
    Filter,
    FileSpreadsheet,
    Camera,
    LayoutGrid,
    List,
    Eye,
    Trash2
} from "lucide-react"
import ContextMenu from "@/components/ui/ContextMenu"
import DeleteConfirmDialog from "@/components/ui/DeleteConfirmDialog"
import { deleteCompany } from "@/app/actions/companies"

export default function CompaniesPage() {
    const router = useRouter()
    const [isUploadModalOpen, setIsUploadModalOpen] = useState(false)
    const [currentPage, setCurrentPage] = useState(1)
    const [allCompanies, setAllCompanies] = useState<any[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [searchQuery, setSearchQuery] = useState("")
    const [viewMode, setViewMode] = useState<'table' | 'card'>('table')
    const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null)

    const handleDelete = async () => {
        if (!deleteTarget) return
        await deleteCompany(deleteTarget.id)
        setAllCompanies(prev => prev.filter(c => c.id !== deleteTarget.id))
        setDeleteTarget(null)
    }

    useEffect(() => {
        getCompanies().then(data => {
            setAllCompanies(data || [])
            setIsLoading(false)
        })
        // モバイルでは自動的にカードビュー
        const mql = window.matchMedia('(max-width: 768px)')
        if (mql.matches) setViewMode('card')
        const handler = (e: MediaQueryListEvent) => setViewMode(e.matches ? 'card' : 'table')
        mql.addEventListener('change', handler)
        return () => mql.removeEventListener('change', handler)
    }, [])

    // 検索フィルタ
    const filteredCompanies = searchQuery
        ? allCompanies.filter((c: any) =>
            c.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            c.industry?.toLowerCase().includes(searchQuery.toLowerCase())
        )
        : allCompanies

    // ページネーション
    const itemsPerPage = 20
    const totalPages = Math.ceil(filteredCompanies.length / itemsPerPage)
    const startIndex = (currentPage - 1) * itemsPerPage
    const currentCompanies = filteredCompanies.slice(startIndex, startIndex + itemsPerPage)

    return (
        <div className="space-y-6">
            {/* 固定ヘッダー部分 */}
            <div className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur-sm -mx-4 md:-mx-8 px-4 md:px-8 pb-4 space-y-4">
                {/* ページヘッダー */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                            <Building2 className="w-6 h-6 text-blue-600" />
                            企業・顧客管理
                        </h1>
                        <p className="text-sm text-slate-500 mt-1">
                            登録されている全{filteredCompanies.length}社の企業情報を管理します。
                        </p>
                    </div>

                    {isLoading && (
                        <div className="text-sm text-blue-600 animate-pulse">データを読み込み中...</div>
                    )}

                    <div className="flex items-center gap-2 flex-wrap">
                        <div className="hidden sm:flex bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
                            <button
                                onClick={() => setIsUploadModalOpen(true)}
                                className="flex items-center gap-2 px-3 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 border-r border-slate-200 transition-colors"
                            >
                                <Camera className="w-4 h-4 text-blue-600" />
                                名刺から登録
                            </button>
                            <button
                                onClick={() => setIsUploadModalOpen(true)}
                                className="flex items-center gap-2 px-3 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
                            >
                                <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                                CSV
                            </button>
                        </div>
                        <button className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors shadow-sm">
                            <Plus className="w-4 h-4" />
                            新規企業
                        </button>
                    </div>
                </div>

                {/* フィルター & 検索バー */}
                <div className="bg-white p-3 md:p-4 rounded-xl shadow-sm border border-slate-200 flex flex-col sm:flex-row gap-3 justify-between items-center">
                    <div className="relative flex-1 w-full max-w-md">
                        <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                        <input
                            type="text"
                            placeholder="企業名、業種で検索..."
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
                        <button className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-3 py-2 bg-white border border-slate-200 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-50 transition-colors">
                            <Download className="w-4 h-4" />
                            エクスポート
                        </button>
                        {/* 表示切替 */}
                        <div className="flex border border-slate-200 rounded-lg overflow-hidden">
                            <button
                                onClick={() => setViewMode('table')}
                                className={`p-2 ${viewMode === 'table' ? 'bg-blue-50 text-blue-600' : 'bg-white text-slate-400 hover:bg-slate-50'}`}
                            >
                                <List className="w-4 h-4" />
                            </button>
                            <button
                                onClick={() => setViewMode('card')}
                                className={`p-2 ${viewMode === 'card' ? 'bg-blue-50 text-blue-600' : 'bg-white text-slate-400 hover:bg-slate-50'}`}
                            >
                                <LayoutGrid className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* テーブル表示 */}
            {viewMode === 'table' ? (
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-visible">
                    <div className="overflow-x-auto overflow-y-visible">
                        <table className="min-w-full divide-y divide-slate-200">
                            <thead className="bg-slate-50/50">
                                <tr>
                                    <th className="px-3 md:px-6 py-3.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">企業名 / 業種</th>
                                    <th className="px-3 md:px-6 py-3.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider hidden sm:table-cell">メイン担当者</th>
                                    <th className="px-3 md:px-6 py-3.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">ステータス</th>
                                    <th className="px-3 md:px-6 py-3.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider hidden md:table-cell">進行中商談</th>
                                    <th className="relative px-3 md:px-6 py-3.5"><span className="sr-only">アクション</span></th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 bg-white">
                                {currentCompanies.map((company: any) => {
                                    const contact = company.contacts?.[0]
                                    const activeDeals = company.deals?.filter((d: any) => d.status !== '失注' && d.status !== '入金確認完了').length || 0

                                    return (
                                        <tr
                                            key={company.id}
                                            onClick={() => router.push(`/companies/${company.id}`)}
                                            className="hover:bg-slate-50/80 transition-colors cursor-pointer group"
                                        >
                                            <td className="px-3 md:px-6 py-4 whitespace-nowrap">
                                                <div className="flex items-center">
                                                    <div className="h-10 w-10 shrink-0 rounded-lg bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-100 flex items-center justify-center">
                                                        <Building2 className="h-5 w-5 text-blue-600" />
                                                    </div>
                                                    <div className="ml-3 md:ml-4">
                                                        <div className="text-sm font-semibold text-slate-900 group-hover:text-blue-600 transition-colors">{company.name}</div>
                                                        <div className="text-xs text-slate-500 mt-0.5">{company.industry || '業種未設定'}</div>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-3 md:px-6 py-4 whitespace-nowrap hidden sm:table-cell">
                                                <div className="text-sm font-medium text-slate-900">{contact?.name || '未設定'}</div>
                                                <div className="text-xs text-slate-500 mt-0.5">{contact?.email || ''}</div>
                                            </td>
                                            <td className="px-3 md:px-6 py-4 whitespace-nowrap">
                                                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${
                                                    company.status === '商談中' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                                                    company.status === '成約' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                                                    company.status === '見込み' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                                                    'bg-slate-100 text-slate-600 border-slate-200'
                                                }`}>
                                                    {company.status || '見込み'}
                                                </span>
                                            </td>
                                            <td className="px-3 md:px-6 py-4 whitespace-nowrap text-sm text-slate-600 font-medium hidden md:table-cell">
                                                {activeDeals > 0 ? (
                                                    <span className="flex items-center gap-1.5">
                                                        <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                                                        {activeDeals}件
                                                    </span>
                                                ) : (
                                                    <span className="text-slate-400">なし</span>
                                                )}
                                            </td>
                                            <td className="px-3 md:px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                                <ContextMenu items={[
                                                    { label: "詳細を見る", icon: <Eye className="w-4 h-4" />, onClick: () => router.push(`/companies/${company.id}`) },
                                                    { label: "削除", icon: <Trash2 className="w-4 h-4" />, variant: "danger", onClick: () => setDeleteTarget({ id: company.id, name: company.name }) },
                                                ]} />
                                            </td>
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </table>
                    </div>
                    <div className="px-4 md:px-6 py-4 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between">
                        <p className="text-sm text-slate-500">全{filteredCompanies.length}件中 {startIndex + 1}-{Math.min(startIndex + itemsPerPage, filteredCompanies.length)}件</p>
                        <div className="flex gap-1">
                            <button disabled={currentPage === 1} onClick={() => setCurrentPage(p => Math.max(1, p - 1))} className="px-3 py-1 text-sm border border-slate-200 rounded-md bg-white text-slate-500 hover:bg-slate-50 disabled:opacity-50">前へ</button>
                            <button className="px-3 py-1 text-sm border border-blue-200 rounded-md bg-white text-blue-600 font-medium min-w-[2rem]">{currentPage}</button>
                            <span className="px-2 py-1 text-slate-400">/ {totalPages}</span>
                            <button disabled={currentPage === totalPages} onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} className="px-3 py-1 text-sm border border-slate-200 rounded-md bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-50">次へ</button>
                        </div>
                    </div>
                </div>
            ) : (
                /* カード表示（モバイル最適化） */
                <div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        {currentCompanies.map((company: any) => {
                            const contact = company.contacts?.[0]
                            const activeDeals = company.deals?.filter((d: any) => d.status !== '失注' && d.status !== '入金確認完了').length || 0

                            return (
                                <div
                                    key={company.id}
                                    onClick={() => router.push(`/companies/${company.id}`)}
                                    className="bg-white rounded-xl border border-slate-200 p-4 hover:shadow-md transition-all cursor-pointer group"
                                >
                                    <div className="flex items-center gap-3 mb-3">
                                        <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-100 flex items-center justify-center shrink-0">
                                            <Building2 className="h-5 w-5 text-blue-600" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <h3 className="text-sm font-bold text-slate-900 group-hover:text-blue-600 truncate">{company.name}</h3>
                                            <p className="text-xs text-slate-500">{company.industry || '業種未設定'}</p>
                                        </div>
                                        <ContextMenu items={[
                                            { label: "詳細を見る", icon: <Eye className="w-4 h-4" />, onClick: () => router.push(`/companies/${company.id}`) },
                                            { label: "削除", icon: <Trash2 className="w-4 h-4" />, variant: "danger", onClick: () => setDeleteTarget({ id: company.id, name: company.name }) },
                                        ]} />
                                    </div>
                                    {contact && (
                                        <p className="text-xs text-slate-600 mb-2 truncate">担当: {contact.name}</p>
                                    )}
                                    <div className="flex items-center justify-between text-xs">
                                        <span className={`px-2 py-0.5 rounded-full font-medium border ${
                                            company.status === '商談中' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                                            company.status === '成約' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                                            'bg-amber-50 text-amber-700 border-amber-200'
                                        }`}>
                                            {company.status || '見込み'}
                                        </span>
                                        <span className="text-slate-500">
                                            商談: {activeDeals}件
                                        </span>
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                    {/* ページネーション */}
                    <div className="mt-4 flex items-center justify-between">
                        <p className="text-sm text-slate-500">全{filteredCompanies.length}件中 {startIndex + 1}-{Math.min(startIndex + itemsPerPage, filteredCompanies.length)}件</p>
                        <div className="flex gap-1">
                            <button disabled={currentPage === 1} onClick={() => setCurrentPage(p => Math.max(1, p - 1))} className="px-3 py-1 text-sm border border-slate-200 rounded-md bg-white text-slate-500 hover:bg-slate-50 disabled:opacity-50">前へ</button>
                            <button className="px-3 py-1 text-sm border border-blue-200 rounded-md bg-white text-blue-600 font-medium">{currentPage}</button>
                            <span className="px-2 py-1 text-slate-400">/ {totalPages}</span>
                            <button disabled={currentPage === totalPages} onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} className="px-3 py-1 text-sm border border-slate-200 rounded-md bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-50">次へ</button>
                        </div>
                    </div>
                </div>
            )}

            {/* 削除確認ダイアログ */}
            {deleteTarget && (
                <DeleteConfirmDialog
                    title="企業を削除"
                    message={`「${deleteTarget.name}」を削除しますか？関連する担当者・商談も影響を受ける可能性があります。`}
                    onConfirm={handleDelete}
                    onCancel={() => setDeleteTarget(null)}
                />
            )}

            {/* 一括アップロードモーダル */}
            {isUploadModalOpen && (
                <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden">
                        <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                            <h3 className="text-lg font-bold text-slate-900">一括インポート・自動登録</h3>
                            <button onClick={() => setIsUploadModalOpen(false)} className="text-slate-400 hover:text-slate-600">✕</button>
                        </div>
                        <div className="p-6 space-y-6">
                            <div onClick={() => router.push('/scan')} className="border border-dashed border-slate-200 rounded-xl p-6 bg-slate-50/50 hover:bg-blue-50/50 hover:border-blue-200 transition-all cursor-pointer group">
                                <div className="flex flex-col items-center justify-center text-center space-y-3">
                                    <div className="w-12 h-12 bg-white rounded-full shadow-sm flex items-center justify-center group-hover:scale-110 transition-transform">
                                        <Camera className="w-6 h-6 text-blue-600" />
                                    </div>
                                    <div>
                                        <p className="text-sm font-semibold text-slate-900">名刺を撮影・アップロード</p>
                                        <p className="text-xs text-slate-500 mt-1">AIが企業情報と担当者を自動で読み取ります。</p>
                                    </div>
                                </div>
                            </div>
                            <div className="relative">
                                <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-200"></div></div>
                                <div className="relative flex justify-center"><span className="bg-white px-2 text-xs text-slate-400 uppercase">or</span></div>
                            </div>
                            <div className="border border-dashed border-slate-200 rounded-xl p-6 bg-slate-50/50 hover:bg-emerald-50/50 hover:border-emerald-200 transition-all cursor-pointer group">
                                <div className="flex flex-col items-center justify-center text-center space-y-3">
                                    <div className="w-12 h-12 bg-white rounded-full shadow-sm flex items-center justify-center group-hover:scale-110 transition-transform">
                                        <FileSpreadsheet className="w-6 h-6 text-emerald-600" />
                                    </div>
                                    <div>
                                        <p className="text-sm font-semibold text-slate-900">CSVから一括インポート</p>
                                        <p className="text-xs text-slate-500 mt-1">既存のCRMから企業リストを登録します。</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end">
                            <button onClick={() => setIsUploadModalOpen(false)} className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">キャンセル</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
