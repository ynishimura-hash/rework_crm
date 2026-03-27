"use client"

import { useState, use, useEffect } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { getCompanyById, updateCompany } from "@/app/actions/companies"
import { getContactsByCompanyId } from "@/app/actions/contacts"
import { getDealsByCompanyId } from "@/app/actions/deals"
import {
    Building2,
    MapPin,
    Globe,
    Phone,
    Mail,
    Calendar,
    MessageSquare,
    FileText,
    Plus,
    ArrowLeft,
    ExternalLink,
    ChevronRight,
    UserCircle,
    Save,
    Trash2
} from "lucide-react"
import DeleteConfirmDialog from "@/components/ui/DeleteConfirmDialog"
import { deleteCompany } from "@/app/actions/companies"

export default function CompanyDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const router = useRouter()
    const resolvedParams = use(params)
    const companyId = resolvedParams.id

    const [companyInfo, setCompanyInfo] = useState<any>(null)
    const [contacts, setContacts] = useState<any[]>([])
    const [deals, setDeals] = useState<any[]>([])
    const [isLoading, setIsLoading] = useState(true)

    const [activeTab, setActiveTab] = useState('pipeline')
    const [isEditing, setIsEditing] = useState(false)
    const [showDeleteDialog, setShowDeleteDialog] = useState(false)

    const handleDeleteCompany = async () => {
        await deleteCompany(companyId)
        router.push('/companies')
    }
    const [editForm, setEditForm] = useState({
        name: '',
        industry: '',
        status: '',
        email: '',
        hp_url: '',
        address: '',
        internal_staff: '',
        referral_source: ''
    })

    useEffect(() => {
        async function loadData() {
            try {
                const company = await getCompanyById(companyId)
                if (company) {
                    setCompanyInfo(company)
                    // editing state setup
                    setEditForm({
                        name: company.name || '',
                        industry: company.industry || '',
                        status: company.status || '未対応',
                        email: company.email || '',
                        hp_url: company.hp_url || '',
                        address: company.address || '',
                        internal_staff: company.internal_staff || '',
                        referral_source: company.referral_source || ''
                    })

                    const [companyContacts, companyDeals] = await Promise.all([
                        getContactsByCompanyId(companyId),
                        getDealsByCompanyId(companyId)
                    ])
                    setContacts(companyContacts || [])
                    setDeals(companyDeals || [])
                }
            } catch (error) {
                console.error("Failed to fetch company details:", error)
            } finally {
                setIsLoading(false)
            }
        }
        loadData()
    }, [companyId])

    // TODO: 活動ログテーブルから取得に切り替え
    const timelineEvents: any[] = []

    const handleSave = async () => {
        setIsLoading(true)
        try {
            const formData = new FormData()
            formData.append('name', editForm.name)
            formData.append('industry', editForm.industry)
            formData.append('hp_url', editForm.hp_url)
            formData.append('address', editForm.address)
            formData.append('internal_staff', editForm.internal_staff)
            formData.append('referral_source', editForm.referral_source)

            const updatedCompany = await updateCompany(companyId, formData)
            setCompanyInfo({ ...companyInfo, ...updatedCompany })
            setIsEditing(false)
            alert('変更を保存しました。')
        } catch (error) {
            console.error("Update failed:", error)
            alert('保存に失敗しました。')
        } finally {
            setIsLoading(false)
        }
    }

    if (isLoading) {
        return <div className="p-4 md:p-8 text-center text-blue-600 animate-pulse">データを読み込み中...</div>
    }

    if (!companyInfo) {
        return <div className="p-4 md:p-8 text-center text-slate-500">企業データが見つかりません。</div>
    }

    return (
        <div className="space-y-6 pb-20">
            {/* 戻るボタン */}
            <div>
                <button onClick={() => router.back()} className="inline-flex items-center text-sm font-medium text-slate-500 hover:text-slate-900 transition-colors">
                    <ArrowLeft className="w-4 h-4 mr-1" />
                    戻る
                </button>
            </div>

            {/* 企業ヘッダー（プロファイル） */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 md:p-8 relative overflow-hidden">
                <div className="relative z-10 flex flex-col md:flex-row md:items-start justify-between gap-6">
                    <div className="flex-1 space-y-4 w-full">
                        {isEditing ? (
                            <div className="space-y-4 w-full max-w-2xl bg-slate-50 p-4 rounded-xl border border-slate-200">
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-semibold text-slate-700 mb-1">企業名</label>
                                        <input
                                            type="text"
                                            className="w-full border border-slate-200 rounded px-3 py-1.5 text-sm"
                                            value={editForm.name}
                                            onChange={e => setEditForm({ ...editForm, name: e.target.value })}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-slate-700 mb-1">ステータス</label>
                                        <select
                                            className="w-full border border-slate-200 rounded px-3 py-1.5 text-sm"
                                            value={editForm.status}
                                            onChange={e => setEditForm({ ...editForm, status: e.target.value })}
                                        >
                                            <option>未対応</option>
                                            <option>提案中</option>
                                            <option>商談中</option>
                                            <option>既存顧客</option>
                                            <option>失注</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-slate-700 mb-1">業種</label>
                                        <input
                                            type="text"
                                            className="w-full border border-slate-200 rounded px-3 py-1.5 text-sm"
                                            value={editForm.industry}
                                            onChange={e => setEditForm({ ...editForm, industry: e.target.value })}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-slate-700 mb-1">Webサイト (URL)</label>
                                        <input
                                            type="text"
                                            className="w-full border border-slate-200 rounded px-3 py-1.5 text-sm"
                                            value={editForm.hp_url}
                                            onChange={e => setEditForm({ ...editForm, hp_url: e.target.value })}
                                        />
                                    </div>
                                    <div className="col-span-2">
                                        <label className="block text-xs font-semibold text-slate-700 mb-1">住所</label>
                                        <input
                                            type="text"
                                            className="w-full border border-slate-200 rounded px-3 py-1.5 text-sm"
                                            value={editForm.address}
                                            onChange={e => setEditForm({ ...editForm, address: e.target.value })}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-slate-700 mb-1">社内担当者</label>
                                        <input
                                            type="text"
                                            className="w-full border border-slate-200 rounded px-3 py-1.5 text-sm"
                                            value={editForm.internal_staff}
                                            onChange={e => setEditForm({ ...editForm, internal_staff: e.target.value })}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-slate-700 mb-1">担当代理店・紹介者</label>
                                        <input
                                            type="text"
                                            className="w-full border border-slate-200 rounded px-3 py-1.5 text-sm"
                                            value={editForm.referral_source}
                                            onChange={e => setEditForm({ ...editForm, referral_source: e.target.value })}
                                        />
                                    </div>
                                </div>
                                <div className="flex justify-end gap-2 mt-4">
                                    <button onClick={() => setIsEditing(false)} className="px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-200 rounded">キャンセル</button>
                                    <button onClick={handleSave} className="flex items-center gap-1 px-4 py-1.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded shadow-sm">
                                        <Save className="w-4 h-4" />
                                        保存
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <>
                                <div className="flex items-center gap-3 flex-wrap">
                                    <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                                        {companyInfo.status}
                                    </span>
                                </div>
                                <h1 className="text-3xl font-bold text-slate-900">{companyInfo.name}</h1>
                                <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-slate-600">
                                    <div className="flex items-center gap-1.5">
                                        <Building2 className="w-4 h-4 text-slate-400" />
                                        {companyInfo.industry}
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                        <Mail className="w-4 h-4 text-slate-400" />
                                        {contacts.length > 0 ? contacts[0].email : '未登録'}
                                    </div>
                                    {companyInfo.hp_url && (
                                        <div className="flex items-center gap-1.5">
                                            <Globe className="w-4 h-4 text-slate-400" />
                                            <a href={companyInfo.hp_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">WEBサイト</a>
                                        </div>
                                    )}
                                    {companyInfo.address && (
                                        <div className="flex items-center gap-1.5">
                                            <MapPin className="w-4 h-4 text-slate-400" />
                                            {companyInfo.address}
                                        </div>
                                    )}
                                    {companyInfo.internal_staff && (
                                        <div className="flex items-center gap-1.5">
                                            <UserCircle className="w-4 h-4 text-slate-400" />
                                            社内担当: {companyInfo.internal_staff}
                                        </div>
                                    )}
                                </div>
                                <div className="mt-4 bg-slate-50 p-4 rounded-xl border border-slate-100 text-sm text-slate-700 leading-relaxed max-w-4xl">
                                    <div className="font-semibold text-slate-900 mb-1 text-xs uppercase tracking-wider">AI 生成概要</div>
                                    AI定額制研修やDX定額制研修などに興味を持っている可能性がある企業。研修・人材育成に関するソリューションを検討中のステータスです。
                                </div>
                            </>
                        )}
                    </div>

                    {!isEditing && (
                        <div className="flex flex-col gap-2 shrink-0">
                            <button className="px-5 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors shadow-sm flex items-center justify-center gap-2">
                                <Plus className="w-4 h-4" />
                                新規アクション
                            </button>
                            <button
                                onClick={() => setIsEditing(true)}
                                className="px-5 py-2.5 bg-white border border-slate-200 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-50 transition-colors flex items-center justify-center gap-2"
                            >
                                企業情報編集
                            </button>
                            <button
                                onClick={() => setShowDeleteDialog(true)}
                                className="px-5 py-2.5 bg-white border border-rose-200 text-rose-600 rounded-lg text-sm font-medium hover:bg-rose-50 transition-colors flex items-center justify-center gap-2"
                            >
                                <Trash2 className="w-4 h-4" />
                                削除
                            </button>
                        </div>
                    )}
                </div>
                <div className="absolute top-0 right-0 -mr-20 -mt-20 w-64 h-64 bg-blue-50 rounded-full blur-3xl opacity-60 pointer-events-none"></div>
            </div>

            {/* HP取得企業情報 */}
            {!isEditing && (companyInfo.representative || companyInfo.established_year || companyInfo.employee_count || companyInfo.capital || companyInfo.business_description || companyInfo.phone) && (
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                    <div className="p-4 md:p-5 border-b border-slate-100 flex items-center gap-2">
                        <Globe className="w-4 h-4 text-blue-600" />
                        <h2 className="text-sm font-bold text-slate-900">HP取得 企業情報</h2>
                        <span className="text-[10px] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-medium">自動取得</span>
                    </div>
                    <div className="p-4 md:p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                        {companyInfo.representative && (
                            <div>
                                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">代表者</p>
                                <p className="text-sm text-slate-900 font-medium">{companyInfo.representative}</p>
                            </div>
                        )}
                        {companyInfo.established_year && (
                            <div>
                                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">設立</p>
                                <p className="text-sm text-slate-900 font-medium">{companyInfo.established_year}</p>
                            </div>
                        )}
                        {companyInfo.employee_count && (
                            <div>
                                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">従業員数</p>
                                <p className="text-sm text-slate-900 font-medium">{companyInfo.employee_count}</p>
                            </div>
                        )}
                        {companyInfo.capital && (
                            <div>
                                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">資本金</p>
                                <p className="text-sm text-slate-900 font-medium">{companyInfo.capital}</p>
                            </div>
                        )}
                        {companyInfo.phone && (
                            <div>
                                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">代表電話</p>
                                <p className="text-sm text-slate-900 font-medium">{companyInfo.phone}</p>
                            </div>
                        )}
                        {companyInfo.business_description && (
                            <div className="sm:col-span-2 lg:col-span-3">
                                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">事業内容</p>
                                <p className="text-sm text-slate-700 leading-relaxed">{companyInfo.business_description}</p>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* メイングリッドエリア */}
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">

                {/* 左側カラム (2/3幅) */}
                <div className="xl:col-span-2 space-y-6">
                    <div className="bg-white rounded-xl shadow-sm border border-slate-200 px-2 flex space-x-1">
                        <button
                            onClick={() => setActiveTab('pipeline')}
                            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${activeTab === 'pipeline' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'}`}
                        >
                            関連商談・パイプライン
                        </button>
                        <button
                            onClick={() => setActiveTab('timeline')}
                            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${activeTab === 'timeline' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'}`}
                        >
                            活動タイムライン
                        </button>
                    </div>

                    {activeTab === 'pipeline' && (
                        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                                <h2 className="text-lg font-bold text-slate-900">進行中の商談（{deals.length}件）</h2>
                                <button className="text-sm font-medium text-blue-600 hover:text-blue-700 bg-blue-50 px-3 py-1.5 rounded-lg flex items-center gap-1">
                                    <Plus className="w-4 h-4" /> 新規商談
                                </button>
                            </div>
                            <div className="divide-y divide-slate-100">
                                {deals.length === 0 ? (
                                    <div className="p-8 text-center text-slate-400">現在紐づいている商談はありません。</div>
                                ) : (
                                    deals.map((deal) => (
                                        <div
                                            key={deal.id}
                                            onClick={() => router.push(`/deals/${deal.id}`)}
                                            className="p-5 hover:bg-slate-50 transition-colors group cursor-pointer"
                                        >
                                            <div className="flex items-center justify-between mb-2">
                                                <span className={`px-2.5 py-0.5 border text-xs font-semibold rounded-full ${deal.status === '成約' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-blue-50 text-blue-700 border-blue-200'}`}>{deal.status}</span>
                                                <span className="text-xs font-medium text-slate-500">成約見込: {deal.close_date ? new Date(deal.close_date).toLocaleDateString() : '-'}</span>
                                            </div>
                                            <h3 className="text-base font-bold text-slate-900 mb-1 group-hover:text-blue-600 transition-colors">{deal.title}</h3>
                                            <p className="text-sm text-slate-500 mb-3">{companyInfo.name} 向け提案</p>
                                            <div className="flex justify-between items-end">
                                                <p className="text-lg font-bold text-slate-900">¥{deal.estimated_amount ? Number(deal.estimated_amount).toLocaleString() : 0}</p>
                                                <span className="text-sm text-blue-600 flex items-center gap-1 font-medium">詳細を見る <ChevronRight className="w-4 h-4" /></span>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    )}

                    {activeTab === 'timeline' && (
                        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
                            <h2 className="text-lg font-bold text-slate-900 mb-8">活動情報（オートトラッキング）</h2>
                            {timelineEvents.length > 0 ? (
                                <div className="relative border-l-2 border-slate-100 ml-4 space-y-8 pl-8 pb-4">
                                    {timelineEvents.map((event: any) => (
                                        <div key={event.id} className="relative group">
                                            <div className={`absolute -left-[41px] flex h-10 w-10 items-center justify-center rounded-full ring-8 ring-white ${event.bg} ${event.color} shadow-sm group-hover:scale-110 transition-transform`}>
                                                <event.icon className="h-5 w-5" aria-hidden="true" />
                                            </div>
                                            <div className="flex flex-col sm:flex-row sm:items-baseline justify-between mb-1 gap-1">
                                                <h3 className="text-base font-semibold text-slate-900 group-hover:text-blue-600 transition-colors cursor-pointer">
                                                    {event.title}
                                                </h3>
                                                <time className="text-xs font-medium text-slate-400 bg-slate-50 px-2 py-0.5 rounded">
                                                    {event.date} {event.time}
                                                </time>
                                            </div>
                                            <div className="text-sm text-slate-600 mb-3 bg-slate-50/50 p-3 rounded-xl border border-slate-100">
                                                {event.desc}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="text-center py-8 bg-slate-50 border border-slate-100/50 rounded-lg border-dashed">
                                    <p className="text-sm text-slate-500">活動履歴はまだありません</p>
                                    <p className="text-xs text-slate-400 mt-1">商談の進捗や打ち合わせの記録が自動で表示されます</p>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* 右側カラム (1/3幅) */}
                <div className="space-y-6">
                    {/* 連絡窓口（コンタクト） */}
                    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                            <h2 className="text-base font-bold text-slate-900">担当者（{contacts.length}名）</h2>
                            <button className="text-blue-600 hover:text-blue-700 p-1"><Plus className="w-4 h-4" /></button>
                        </div>
                        <div className="divide-y divide-slate-100">
                            {contacts.length === 0 ? (
                                <div className="p-6 text-center text-sm text-slate-400">担当者が登録されていません。</div>
                            ) : (
                                contacts.map((contact) => (
                                    <div
                                        key={contact.id}
                                        onClick={() => router.push(`/contacts/${contact.id}`)}
                                        className="p-5 hover:bg-slate-50 transition-colors group cursor-pointer"
                                    >
                                        <div className="flex items-start justify-between">
                                            <div>
                                                <h3 className="text-sm font-bold text-slate-900 group-hover:text-blue-600 transition-colors mb-1">{contact.name}</h3>
                                                <p className="text-xs text-slate-500 mb-3">{contact.priority ? `優先度: ${contact.priority}` : ''}</p>
                                            </div>
                                        </div>
                                        <div className="space-y-2">
                                            <div className="flex items-center gap-2 text-xs text-slate-600 hover:text-blue-600 transition-colors">
                                                <Mail className="w-3.5 h-3.5 text-slate-400" />
                                                {contact.email}
                                            </div>
                                            <div className="flex items-center gap-2 text-xs text-slate-600">
                                                <Phone className="w-3.5 h-3.5 text-slate-400" />
                                                {contact.phone}
                                            </div>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>


                </div>
            </div>

            {/* 削除確認ダイアログ */}
            {showDeleteDialog && (
                <DeleteConfirmDialog
                    title="企業を削除"
                    message={`「${companyInfo?.name}」を削除しますか？関連する担当者・商談も影響を受ける可能性があります。`}
                    onConfirm={handleDeleteCompany}
                    onCancel={() => setShowDeleteDialog(false)}
                />
            )}
        </div>
    )
}
