"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { getContacts } from "@/app/actions/contacts"
import { Users, Search, Plus, Filter, Download, MoreVertical, Mail, Phone, LayoutGrid, List } from "lucide-react"

export default function ContactsPage() {
    const router = useRouter()
    const [currentPage, setCurrentPage] = useState(1)
    const [allContacts, setAllContacts] = useState<any[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [searchQuery, setSearchQuery] = useState("")
    const [viewMode, setViewMode] = useState<'table' | 'card'>('table')

    useEffect(() => {
        getContacts().then(data => {
            setAllContacts(data || [])
            setIsLoading(false)
        })
        const mql = window.matchMedia('(max-width: 768px)')
        if (mql.matches) setViewMode('card')
        const handler = (e: MediaQueryListEvent) => setViewMode(e.matches ? 'card' : 'table')
        mql.addEventListener('change', handler)
        return () => mql.removeEventListener('change', handler)
    }, [])

    const filteredContacts = searchQuery
        ? allContacts.filter((c: any) =>
            c.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            c.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            c.companies?.name?.toLowerCase().includes(searchQuery.toLowerCase())
        )
        : allContacts

    const itemsPerPage = 20
    const totalPages = Math.ceil(filteredContacts.length / itemsPerPage) || 1
    const startIndex = (currentPage - 1) * itemsPerPage
    const currentContacts = filteredContacts.slice(startIndex, startIndex + itemsPerPage)

    return (
        <div className="space-y-6">
            {/* 固定ヘッダー部分 */}
            <div className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur-sm -mx-4 md:-mx-8 px-4 md:px-8 pb-4 space-y-4">
                {/* ページヘッダー */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                            <Users className="w-6 h-6 text-blue-600" />
                            担当者リスト
                        </h1>
                        <p className="text-sm text-slate-500 mt-1">取引先企業の担当者{filteredContacts.length}名を管理します。</p>
                    </div>
                    {isLoading && <div className="text-sm text-blue-600 animate-pulse">データを読み込み中...</div>}
                    <button className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors shadow-sm">
                        <Plus className="w-4 h-4" />
                        新規担当者
                    </button>
                </div>

                {/* フィルター & 検索バー */}
                <div className="bg-white p-3 md:p-4 rounded-xl shadow-sm border border-slate-200 flex flex-col sm:flex-row gap-3 justify-between items-center">
                    <div className="relative flex-1 w-full max-w-md">
                        <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                        <input
                            type="text"
                            placeholder="氏名、企業名、メールで検索..."
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
                                    <th className="px-3 md:px-6 py-3.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">氏名 / 所属企業</th>
                                    <th className="px-3 md:px-6 py-3.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider hidden sm:table-cell">連絡先</th>
                                    <th className="px-3 md:px-6 py-3.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">優先度</th>
                                    <th className="relative px-3 md:px-6 py-3.5"><span className="sr-only">アクション</span></th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 bg-white">
                                {currentContacts.map((contact: any) => (
                                    <tr key={contact.id} onClick={() => router.push(`/contacts/${contact.id}`)} className="hover:bg-slate-50/80 transition-colors cursor-pointer group">
                                        <td className="px-3 md:px-6 py-4 whitespace-nowrap">
                                            <div className="flex items-center">
                                                <div className="h-10 w-10 shrink-0 rounded-full bg-gradient-to-br from-indigo-50 to-blue-50 border border-indigo-100 flex items-center justify-center">
                                                    <Users className="h-5 w-5 text-indigo-600" />
                                                </div>
                                                <div className="ml-3 md:ml-4 min-w-0">
                                                    <div className="text-sm font-semibold text-slate-900 truncate">{contact.name || '名称未設定'}</div>
                                                    <div className="text-xs text-slate-500 mt-0.5 truncate">{contact.companies?.name || '所属不明'}</div>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-3 md:px-6 py-4 whitespace-nowrap hidden sm:table-cell">
                                            <div className="flex flex-col gap-1">
                                                <div className="flex items-center gap-2 text-sm text-slate-600">
                                                    <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                                    <span className="truncate max-w-[200px]">{contact.email || '-'}</span>
                                                </div>
                                                <div className="flex items-center gap-2 text-sm text-slate-600">
                                                    <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                                    <span>{contact.phone || '-'}</span>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-3 md:px-6 py-4 whitespace-nowrap">
                                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${
                                                contact.priority === '高' ? 'bg-rose-50 text-rose-700 border-rose-200' :
                                                contact.priority === '中' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                                                'bg-slate-50 text-slate-700 border-slate-200'
                                            }`}>
                                                {contact.priority || '中'}
                                            </span>
                                        </td>
                                        <td className="px-3 md:px-6 py-4 whitespace-nowrap text-right">
                                            <button className="text-slate-400 hover:text-slate-600 p-1 rounded-md hover:bg-slate-100 transition-colors">
                                                <MoreVertical className="w-5 h-5" />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <div className="px-4 md:px-6 py-4 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between">
                        <p className="text-sm text-slate-500">全{filteredContacts.length}件中 {filteredContacts.length > 0 ? startIndex + 1 : 0}-{Math.min(startIndex + itemsPerPage, filteredContacts.length)}件</p>
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
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        {currentContacts.map((contact: any) => (
                            <div
                                key={contact.id}
                                onClick={() => router.push(`/contacts/${contact.id}`)}
                                className="bg-white rounded-xl border border-slate-200 p-4 hover:shadow-md transition-all cursor-pointer"
                            >
                                <div className="flex items-center gap-3 mb-3">
                                    <div className="h-10 w-10 rounded-full bg-gradient-to-br from-indigo-50 to-blue-50 border border-indigo-100 flex items-center justify-center shrink-0">
                                        <Users className="h-5 w-5 text-indigo-600" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <h3 className="text-sm font-bold text-slate-900 truncate">{contact.name}</h3>
                                        <p className="text-xs text-slate-500 truncate">{contact.companies?.name || '所属不明'}</p>
                                    </div>
                                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium border shrink-0 ${
                                        contact.priority === '高' ? 'bg-rose-50 text-rose-700 border-rose-200' :
                                        contact.priority === '中' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                                        'bg-slate-50 text-slate-700 border-slate-200'
                                    }`}>
                                        {contact.priority || '中'}
                                    </span>
                                </div>
                                <div className="space-y-1 text-xs text-slate-600">
                                    {contact.email && (
                                        <div className="flex items-center gap-2">
                                            <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                            <span className="truncate">{contact.email}</span>
                                        </div>
                                    )}
                                    {contact.phone && (
                                        <div className="flex items-center gap-2">
                                            <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                            <span>{contact.phone}</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                    <div className="mt-4 flex items-center justify-between">
                        <p className="text-sm text-slate-500">全{filteredContacts.length}件中 {filteredContacts.length > 0 ? startIndex + 1 : 0}-{Math.min(startIndex + itemsPerPage, filteredContacts.length)}件</p>
                        <div className="flex gap-1">
                            <button disabled={currentPage === 1} onClick={() => setCurrentPage(p => Math.max(1, p - 1))} className="px-3 py-1 text-sm border border-slate-200 rounded-md bg-white text-slate-500 hover:bg-slate-50 disabled:opacity-50">前へ</button>
                            <button className="px-3 py-1 text-sm border border-blue-200 rounded-md bg-white text-blue-600 font-medium">{currentPage}</button>
                            <span className="px-2 py-1 text-slate-400">/ {totalPages}</span>
                            <button disabled={currentPage >= totalPages} onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} className="px-3 py-1 text-sm border border-slate-200 rounded-md bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-50">次へ</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
