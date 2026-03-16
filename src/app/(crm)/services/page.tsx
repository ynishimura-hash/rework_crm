"use client"

import { useState, useEffect } from "react"
import { getServices, createService, updateService, deleteService } from "@/app/actions/services"
import { Layers, Search, Plus, Filter, Download, Pencil, Trash2, X, LayoutGrid, List } from "lucide-react"

// Supabaseから取得するサービスの型
interface Service {
    id: string
    name: string
    base_price: number
    unit: string | null
    is_active: boolean
    created_at: string
    updated_at: string
}

export default function ServicesPage() {
    const [currentPage, setCurrentPage] = useState(1)
    const [allServices, setAllServices] = useState<Service[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [searchQuery, setSearchQuery] = useState("")
    const [viewMode, setViewMode] = useState<'table' | 'card'>('table')

    // モーダル状態
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
    const [editingService, setEditingService] = useState<Service | null>(null)
    const [isSubmitting, setIsSubmitting] = useState(false)

    // 削除確認
    const [deletingService, setDeletingService] = useState<Service | null>(null)

    // フォーム状態
    const [formName, setFormName] = useState("")
    const [formPrice, setFormPrice] = useState("")
    const [formUnit, setFormUnit] = useState("")
    const [formIsActive, setFormIsActive] = useState(true)

    // データ取得
    useEffect(() => {
        loadServices()
        // モバイルでは自動的にカードビュー
        const mql = window.matchMedia('(max-width: 768px)')
        if (mql.matches) setViewMode('card')
        const handler = (e: MediaQueryListEvent) => setViewMode(e.matches ? 'card' : 'table')
        mql.addEventListener('change', handler)
        return () => mql.removeEventListener('change', handler)
    }, [])

    const loadServices = async () => {
        const data = await getServices()
        setAllServices(data || [])
        setIsLoading(false)
    }

    // 検索フィルタ
    const filteredServices = searchQuery
        ? allServices.filter((s) =>
            s.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            s.unit?.toLowerCase().includes(searchQuery.toLowerCase())
        )
        : allServices

    // ページネーション
    const itemsPerPage = 20
    const totalPages = Math.ceil(filteredServices.length / itemsPerPage) || 1
    const startIndex = (currentPage - 1) * itemsPerPage
    const currentServices = filteredServices.slice(startIndex, startIndex + itemsPerPage)

    // 新規作成モーダルを開く
    const openCreateModal = () => {
        setFormName("")
        setFormPrice("")
        setFormUnit("")
        setFormIsActive(true)
        setIsCreateModalOpen(true)
    }

    // 編集モーダルを開く
    const openEditModal = (service: Service) => {
        setFormName(service.name)
        setFormPrice(service.base_price?.toString() || "0")
        setFormUnit(service.unit || "")
        setFormIsActive(service.is_active)
        setEditingService(service)
    }

    // 新規作成
    const handleCreate = async () => {
        if (!formName.trim()) return
        setIsSubmitting(true)
        try {
            const fd = new FormData()
            fd.set("name", formName.trim())
            fd.set("base_price", formPrice || "0")
            fd.set("unit", formUnit.trim())
            await createService(fd)
            await loadServices()
            setIsCreateModalOpen(false)
        } catch (e) {
            console.error("サービス作成エラー:", e)
            alert("サービスの作成に失敗しました。")
        } finally {
            setIsSubmitting(false)
        }
    }

    // 更新
    const handleUpdate = async () => {
        if (!editingService || !formName.trim()) return
        setIsSubmitting(true)
        try {
            const fd = new FormData()
            fd.set("name", formName.trim())
            fd.set("base_price", formPrice || "0")
            fd.set("unit", formUnit.trim())
            fd.set("is_active", formIsActive.toString())
            await updateService(editingService.id, fd)
            await loadServices()
            setEditingService(null)
        } catch (e) {
            console.error("サービス更新エラー:", e)
            alert("サービスの更新に失敗しました。")
        } finally {
            setIsSubmitting(false)
        }
    }

    // 削除
    const handleDelete = async () => {
        if (!deletingService) return
        setIsSubmitting(true)
        try {
            await deleteService(deletingService.id)
            await loadServices()
            setDeletingService(null)
        } catch (e) {
            console.error("サービス削除エラー:", e)
            alert("サービスの削除に失敗しました。")
        } finally {
            setIsSubmitting(false)
        }
    }

    // 価格フォーマット
    const formatPrice = (price: number | null | undefined) => {
        if (price === null || price === undefined) return "都度見積 / -"
        return `¥${price.toLocaleString()}`
    }

    return (
        <div className="space-y-6">
            {/* 固定ヘッダー部分 */}
            <div className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur-sm -mx-4 md:-mx-8 px-4 md:px-8 pb-4 space-y-4">
                {/* ページヘッダー */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                            <Layers className="w-6 h-6 text-blue-600" />
                            提供サービス
                        </h1>
                        <p className="text-sm text-slate-500 mt-1">
                            現在提供しているサービスの一覧（全{filteredServices.length}件）です。
                        </p>
                    </div>
                    {isLoading && (
                        <div className="text-sm text-blue-600 animate-pulse">データを読み込み中...</div>
                    )}
                    <div className="flex items-center gap-3">
                        <button
                            onClick={openCreateModal}
                            className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors shadow-sm"
                        >
                            <Plus className="w-4 h-4" />
                            新規サービス追加
                        </button>
                    </div>
                </div>

                {/* フィルター & 検索バー */}
                <div className="bg-white p-3 md:p-4 rounded-xl shadow-sm border border-slate-200 flex flex-col sm:flex-row gap-3 justify-between items-center">
                    <div className="relative flex-1 w-full max-w-md">
                        <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                        <input
                            type="text"
                            placeholder="サービス名、単位で検索..."
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
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-slate-200">
                            <thead className="bg-slate-50/50">
                                <tr>
                                    <th scope="col" className="px-3 md:px-6 py-3.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                                        サービス名
                                    </th>
                                    <th scope="col" className="px-3 md:px-6 py-3.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                                        価格
                                    </th>
                                    <th scope="col" className="px-3 md:px-6 py-3.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider hidden sm:table-cell">
                                        単位
                                    </th>
                                    <th scope="col" className="px-3 md:px-6 py-3.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider hidden md:table-cell">
                                        状態
                                    </th>
                                    <th scope="col" className="relative px-3 md:px-6 py-3.5">
                                        <span className="sr-only">アクション</span>
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 bg-white">
                                {currentServices.map((service) => (
                                    <tr
                                        key={service.id}
                                        onClick={() => openEditModal(service)}
                                        className="hover:bg-slate-50/80 transition-colors cursor-pointer group"
                                    >
                                        <td className="px-3 md:px-6 py-4">
                                            <div className="flex items-center">
                                                <div className="h-10 w-10 shrink-0 rounded-lg bg-gradient-to-br from-indigo-50 to-blue-50 border border-indigo-100 flex items-center justify-center">
                                                    <Layers className="h-5 w-5 text-indigo-600" />
                                                </div>
                                                <div className="ml-3 md:ml-4 min-w-0 flex-1">
                                                    <div className="text-sm font-semibold text-slate-900 group-hover:text-blue-600 transition-colors line-clamp-2">
                                                        {service.name || '名称未設定'}
                                                    </div>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-3 md:px-6 py-4 whitespace-nowrap text-sm font-bold text-slate-900">
                                            {formatPrice(service.base_price)}
                                        </td>
                                        <td className="px-3 md:px-6 py-4 whitespace-nowrap text-sm text-slate-600 hidden sm:table-cell">
                                            {service.unit || '-'}
                                        </td>
                                        <td className="px-3 md:px-6 py-4 whitespace-nowrap hidden md:table-cell">
                                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${
                                                service.is_active
                                                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                                    : 'bg-slate-100 text-slate-500 border-slate-200'
                                            }`}>
                                                {service.is_active ? '有効' : '無効'}
                                            </span>
                                        </td>
                                        <td className="px-3 md:px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                            <div className="flex items-center justify-end gap-1">
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); openEditModal(service) }}
                                                    className="text-slate-400 hover:text-blue-600 p-1.5 rounded-md hover:bg-blue-50 transition-colors"
                                                    title="編集"
                                                >
                                                    <Pencil className="w-4 h-4" />
                                                </button>
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); setDeletingService(service) }}
                                                    className="text-slate-400 hover:text-rose-600 p-1.5 rounded-md hover:bg-rose-50 transition-colors"
                                                    title="削除"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                                {currentServices.length === 0 && !isLoading && (
                                    <tr>
                                        <td colSpan={5} className="px-6 py-12 text-center text-sm text-slate-400">
                                            {searchQuery ? '検索条件に一致するサービスがありません。' : 'サービスが登録されていません。'}
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                    <div className="px-4 md:px-6 py-4 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between">
                        <p className="text-sm text-slate-500">
                            全{filteredServices.length}件中 {filteredServices.length > 0 ? startIndex + 1 : 0}-{Math.min(startIndex + itemsPerPage, filteredServices.length)}件を表示
                        </p>
                        <div className="flex gap-1">
                            <button
                                disabled={currentPage === 1}
                                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                className="px-3 py-1 text-sm border border-slate-200 rounded-md bg-white text-slate-500 hover:bg-slate-50 disabled:opacity-50"
                            >前へ</button>
                            <button className="px-3 py-1 text-sm border border-blue-200 rounded-md bg-white text-blue-600 font-medium min-w-[2rem]">
                                {currentPage}
                            </button>
                            <span className="px-2 py-1 text-slate-400">/ {totalPages}</span>
                            <button
                                disabled={currentPage >= totalPages}
                                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                className="px-3 py-1 text-sm border border-slate-200 rounded-md bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                            >次へ</button>
                        </div>
                    </div>
                </div>
            ) : (
                /* カード表示（モバイル最適化） */
                <div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        {currentServices.map((service) => (
                            <div
                                key={service.id}
                                onClick={() => openEditModal(service)}
                                className="bg-white rounded-xl border border-slate-200 p-4 hover:shadow-md transition-all cursor-pointer group"
                            >
                                <div className="flex items-center gap-3 mb-3">
                                    <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-indigo-50 to-blue-50 border border-indigo-100 flex items-center justify-center shrink-0">
                                        <Layers className="h-5 w-5 text-indigo-600" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <h3 className="text-sm font-bold text-slate-900 group-hover:text-blue-600 truncate">
                                            {service.name || '名称未設定'}
                                        </h3>
                                        <p className="text-xs text-slate-500">
                                            {service.unit || '単位なし'}
                                        </p>
                                    </div>
                                </div>
                                <div className="flex items-center justify-between">
                                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${
                                        service.is_active
                                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                            : 'bg-slate-100 text-slate-500 border-slate-200'
                                    }`}>
                                        {service.is_active ? '有効' : '無効'}
                                    </span>
                                    <span className="text-sm font-bold text-slate-900">
                                        {formatPrice(service.base_price)}
                                    </span>
                                </div>
                                <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-end gap-1">
                                    <button
                                        onClick={(e) => { e.stopPropagation(); openEditModal(service) }}
                                        className="text-slate-400 hover:text-blue-600 p-1.5 rounded-md hover:bg-blue-50 transition-colors"
                                        title="編集"
                                    >
                                        <Pencil className="w-4 h-4" />
                                    </button>
                                    <button
                                        onClick={(e) => { e.stopPropagation(); setDeletingService(service) }}
                                        className="text-slate-400 hover:text-rose-600 p-1.5 rounded-md hover:bg-rose-50 transition-colors"
                                        title="削除"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        ))}
                        {currentServices.length === 0 && !isLoading && (
                            <div className="col-span-full py-12 text-center text-sm text-slate-400">
                                {searchQuery ? '検索条件に一致するサービスがありません。' : 'サービスが登録されていません。'}
                            </div>
                        )}
                    </div>
                    {/* ページネーション */}
                    <div className="mt-4 flex items-center justify-between">
                        <p className="text-sm text-slate-500">
                            全{filteredServices.length}件中 {filteredServices.length > 0 ? startIndex + 1 : 0}-{Math.min(startIndex + itemsPerPage, filteredServices.length)}件
                        </p>
                        <div className="flex gap-1">
                            <button disabled={currentPage === 1} onClick={() => setCurrentPage(p => Math.max(1, p - 1))} className="px-3 py-1 text-sm border border-slate-200 rounded-md bg-white text-slate-500 hover:bg-slate-50 disabled:opacity-50">前へ</button>
                            <button className="px-3 py-1 text-sm border border-blue-200 rounded-md bg-white text-blue-600 font-medium">{currentPage}</button>
                            <span className="px-2 py-1 text-slate-400">/ {totalPages}</span>
                            <button disabled={currentPage >= totalPages} onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} className="px-3 py-1 text-sm border border-slate-200 rounded-md bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-50">次へ</button>
                        </div>
                    </div>
                </div>
            )}

            {/* 新規作成モーダル */}
            {isCreateModalOpen && (
                <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden">
                        <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                            <h3 className="text-lg font-bold text-slate-900">新規サービス追加</h3>
                            <button onClick={() => setIsCreateModalOpen(false)} className="text-slate-400 hover:text-slate-600 p-1 rounded-md hover:bg-slate-100 transition-colors">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="p-6 space-y-5">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1.5">サービス名 <span className="text-rose-500">*</span></label>
                                <input
                                    type="text"
                                    value={formName}
                                    onChange={(e) => setFormName(e.target.value)}
                                    placeholder="例: Webサイト制作"
                                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all placeholder:text-slate-400"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1.5">価格</label>
                                <div className="relative">
                                    <span className="absolute left-4 top-2.5 text-sm text-slate-500">¥</span>
                                    <input
                                        type="number"
                                        value={formPrice}
                                        onChange={(e) => setFormPrice(e.target.value)}
                                        placeholder="0"
                                        min="0"
                                        className="w-full pl-8 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all placeholder:text-slate-400"
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1.5">単位</label>
                                <input
                                    type="text"
                                    value={formUnit}
                                    onChange={(e) => setFormUnit(e.target.value)}
                                    placeholder="例: 月, 件, ページ"
                                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all placeholder:text-slate-400"
                                />
                            </div>
                        </div>
                        <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
                            <button
                                onClick={() => setIsCreateModalOpen(false)}
                                className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                            >
                                キャンセル
                            </button>
                            <button
                                onClick={handleCreate}
                                disabled={isSubmitting || !formName.trim()}
                                className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {isSubmitting ? '作成中...' : '作成'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* 編集モーダル */}
            {editingService && (
                <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden">
                        <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                            <h3 className="text-lg font-bold text-slate-900">サービス編集</h3>
                            <button onClick={() => setEditingService(null)} className="text-slate-400 hover:text-slate-600 p-1 rounded-md hover:bg-slate-100 transition-colors">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="p-6 space-y-5">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1.5">サービス名 <span className="text-rose-500">*</span></label>
                                <input
                                    type="text"
                                    value={formName}
                                    onChange={(e) => setFormName(e.target.value)}
                                    placeholder="例: Webサイト制作"
                                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all placeholder:text-slate-400"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1.5">価格</label>
                                <div className="relative">
                                    <span className="absolute left-4 top-2.5 text-sm text-slate-500">¥</span>
                                    <input
                                        type="number"
                                        value={formPrice}
                                        onChange={(e) => setFormPrice(e.target.value)}
                                        placeholder="0"
                                        min="0"
                                        className="w-full pl-8 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all placeholder:text-slate-400"
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1.5">単位</label>
                                <input
                                    type="text"
                                    value={formUnit}
                                    onChange={(e) => setFormUnit(e.target.value)}
                                    placeholder="例: 月, 件, ページ"
                                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all placeholder:text-slate-400"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1.5">状態</label>
                                <div className="flex items-center gap-3">
                                    <button
                                        onClick={() => setFormIsActive(true)}
                                        className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-medium border transition-colors ${
                                            formIsActive
                                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                                : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
                                        }`}
                                    >
                                        有効
                                    </button>
                                    <button
                                        onClick={() => setFormIsActive(false)}
                                        className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-medium border transition-colors ${
                                            !formIsActive
                                                ? 'bg-slate-100 text-slate-700 border-slate-300'
                                                : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
                                        }`}
                                    >
                                        無効
                                    </button>
                                </div>
                            </div>
                        </div>
                        <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
                            <button
                                onClick={() => setEditingService(null)}
                                className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                            >
                                キャンセル
                            </button>
                            <button
                                onClick={handleUpdate}
                                disabled={isSubmitting || !formName.trim()}
                                className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {isSubmitting ? '更新中...' : '更新'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* 削除確認モーダル */}
            {deletingService && (
                <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
                        <div className="p-6">
                            <div className="flex items-center gap-3 mb-4">
                                <div className="w-10 h-10 rounded-full bg-rose-100 flex items-center justify-center shrink-0">
                                    <Trash2 className="w-5 h-5 text-rose-600" />
                                </div>
                                <h3 className="text-lg font-bold text-slate-900">サービスの削除</h3>
                            </div>
                            <p className="text-sm text-slate-600">
                                「<span className="font-semibold text-slate-900">{deletingService.name}</span>」を削除してもよろしいですか？この操作は取り消せません。
                            </p>
                        </div>
                        <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
                            <button
                                onClick={() => setDeletingService(null)}
                                className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                            >
                                キャンセル
                            </button>
                            <button
                                onClick={handleDelete}
                                disabled={isSubmitting}
                                className="px-4 py-2 text-sm font-medium bg-rose-600 text-white rounded-lg hover:bg-rose-700 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {isSubmitting ? '削除中...' : '削除する'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
