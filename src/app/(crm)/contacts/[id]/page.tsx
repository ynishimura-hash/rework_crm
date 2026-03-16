"use client"

import { useState, use, useEffect } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { getContactById, updateContact } from "@/app/actions/contacts"
import {
    Users,
    Building2,
    Phone,
    Mail,
    ArrowLeft,
    Save,
    MessageSquare,
    Clock,
    Plus
} from "lucide-react"

export default function ContactDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const router = useRouter()
    const resolvedParams = use(params)
    const contactId = resolvedParams.id

    // DB状態管理
    const [contactInfo, setContactInfo] = useState<any>(null)
    const [companyInfo, setCompanyInfo] = useState<any>(null)
    const [isLoading, setIsLoading] = useState(true)

    const [isEditing, setIsEditing] = useState(false)
    const [editForm, setEditForm] = useState({
        name: '',
        last_name: '',
        first_name: '',
        furigana: '',
        company: '', // company_id自体は変更不可UIとするか、後続でセレクトボックス化
        email: '',
        phone: '',
        priority: '',
        company_id: ''
    })

    useEffect(() => {
        async function loadData() {
            try {
                const contact = await getContactById(contactId)
                if (contact) {
                    setContactInfo(contact)
                    setCompanyInfo(contact.companies || null)

                    setEditForm({
                        name: contact.name || '',
                        last_name: contact.last_name || '',
                        first_name: contact.first_name || '',
                        furigana: contact.furigana || '',
                        company: contact.companies ? contact.companies.name : '',
                        email: contact.email || '',
                        phone: contact.phone || '',
                        priority: contact.priority || '中', // DB未定義項目
                        company_id: contact.company_id || ''
                    })
                }
            } catch (error) {
                console.error("Failed to fetch contact details:", error)
            } finally {
                setIsLoading(false)
            }
        }
        loadData()
    }, [contactId])

    const handleSave = async () => {
        setIsLoading(true)
        try {
            const formData = new FormData()
            const composedName = `${editForm.last_name} ${editForm.first_name}`.trim()
            formData.append('name', composedName)
            formData.append('last_name', editForm.last_name)
            formData.append('first_name', editForm.first_name)
            formData.append('furigana', editForm.furigana)
            formData.append('company_id', editForm.company_id)
            formData.append('email', editForm.email)
            formData.append('phone', editForm.phone)

            const updatedContact = await updateContact(contactId, formData)
            // リレーション部分を維持しつつ更新
            setContactInfo({ ...contactInfo, ...updatedContact, companies: companyInfo })
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

    if (!contactInfo) {
        return <div className="p-4 md:p-8 text-center text-slate-500">担当者データが見つかりません。</div>
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

            {/* 担当者ヘッダー */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 md:p-8 relative overflow-hidden">
                <div className="relative z-10 flex flex-col md:flex-row md:items-start justify-between gap-6">
                    <div className="flex-1 space-y-4 w-full">
                        {isEditing ? (
                            <div className="space-y-4 w-full max-w-2xl bg-slate-50 p-4 rounded-xl border border-slate-200">
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-semibold text-slate-700 mb-1">姓</label>
                                        <input
                                            type="text"
                                            className="w-full border border-slate-200 rounded px-3 py-1.5 text-sm"
                                            value={editForm.last_name}
                                            onChange={e => setEditForm({ ...editForm, last_name: e.target.value })}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-slate-700 mb-1">名</label>
                                        <input
                                            type="text"
                                            className="w-full border border-slate-200 rounded px-3 py-1.5 text-sm"
                                            value={editForm.first_name}
                                            onChange={e => setEditForm({ ...editForm, first_name: e.target.value })}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-slate-700 mb-1">フリガナ</label>
                                        <input
                                            type="text"
                                            className="w-full border border-slate-200 rounded px-3 py-1.5 text-sm"
                                            placeholder="セイ メイ"
                                            value={editForm.furigana}
                                            onChange={e => setEditForm({ ...editForm, furigana: e.target.value })}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-slate-700 mb-1">所属企業</label>
                                        <input
                                            type="text"
                                            className="w-full border border-slate-200 rounded px-3 py-1.5 text-sm cursor-not-allowed bg-slate-100"
                                            value={editForm.company}
                                            readOnly
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-slate-700 mb-1">メールアドレス</label>
                                        <input
                                            type="email"
                                            className="w-full border border-slate-200 rounded px-3 py-1.5 text-sm"
                                            value={editForm.email}
                                            onChange={e => setEditForm({ ...editForm, email: e.target.value })}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-slate-700 mb-1">電話番号</label>
                                        <input
                                            type="text"
                                            className="w-full border border-slate-200 rounded px-3 py-1.5 text-sm"
                                            value={editForm.phone}
                                            onChange={e => setEditForm({ ...editForm, phone: e.target.value })}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-slate-700 mb-1">優先度</label>
                                        <select
                                            className="w-full border border-slate-200 rounded px-3 py-1.5 text-sm"
                                            value={editForm.priority}
                                            onChange={e => setEditForm({ ...editForm, priority: e.target.value })}
                                        >
                                            <option>高</option>
                                            <option>中</option>
                                            <option>低</option>
                                        </select>
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
                                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border ${contactInfo.priority === '高' ? 'bg-rose-50 text-rose-700 border-rose-200' :
                                        contactInfo.priority === '中' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                                            'bg-slate-50 text-slate-700 border-slate-200'
                                        }`}>
                                        優先度: {contactInfo.priority || '未設定'}
                                    </span>
                                </div>
                                <div className="flex items-center gap-3">
                                    <div className="h-12 w-12 shrink-0 rounded-full bg-gradient-to-br from-indigo-50 to-blue-50 border border-indigo-100 flex items-center justify-center">
                                        <Users className="h-6 w-6 text-indigo-600" />
                                    </div>
                                    <div>
                                        {contactInfo.furigana && (
                                            <p className="text-xs text-slate-400 tracking-wider">{contactInfo.furigana}</p>
                                        )}
                                        <h1 className="text-3xl font-bold text-slate-900">{contactInfo.name}</h1>
                                    </div>
                                </div>
                                <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-slate-600 pl-16">
                                    {companyInfo ? (
                                        <Link href={`/companies/${companyInfo.id}`} className="flex items-center gap-1.5 text-blue-600 hover:underline font-medium">
                                            <Building2 className="w-4 h-4" />
                                            {companyInfo.name}
                                        </Link>
                                    ) : (
                                        <div className="flex items-center gap-1.5">
                                            <Building2 className="w-4 h-4 text-slate-400" />
                                            所属企業情報なし
                                        </div>
                                    )}
                                    <div className="flex items-center gap-1.5">
                                        <Mail className="w-4 h-4 text-slate-400" />
                                        {contactInfo.email || '未設定'}
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                        <Phone className="w-4 h-4 text-slate-400" />
                                        {contactInfo.phone || '未設定'}
                                    </div>
                                </div>
                            </>
                        )}
                    </div>

                    {!isEditing && (
                        <div className="flex flex-col gap-2 shrink-0">
                            <button className="px-5 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors shadow-sm flex items-center justify-center gap-2">
                                <Plus className="w-4 h-4" />
                                メッセージ送信
                            </button>
                            <button
                                onClick={() => setIsEditing(true)}
                                className="px-5 py-2.5 bg-white border border-slate-200 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-50 transition-colors flex items-center justify-center gap-2"
                            >
                                連絡先を編集
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* メインエリア */}
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                <div className="xl:col-span-2 space-y-6">
                    {/* コミュニケーション履歴 */}
                    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
                        <div className="flex items-center justify-between mb-6">
                            <h2 className="text-lg font-bold text-slate-900">コミュニケーション履歴（LINE/Email等）</h2>
                            <Link href="/communications" className="text-sm text-blue-600 hover:underline">すべて見る</Link>
                        </div>
                        <div className="space-y-4">
                            <div className="p-4 rounded-xl border border-slate-100 bg-slate-50 flex gap-4">
                                <div className="mt-1 h-8 w-8 shrink-0 rounded-full flex items-center justify-center border bg-emerald-50 border-emerald-100 text-emerald-600">
                                    <MessageSquare className="h-4 w-4" />
                                </div>
                                <div className="flex-1">
                                    <div className="flex justify-between mb-1">
                                        <span className="font-semibold text-sm">LINE 受信</span>
                                        <span className="text-xs text-slate-400">今日 14:30</span>
                                    </div>
                                    <p className="text-sm text-slate-600">本日の打ち合わせありがとうございました。次回の日程についてですが……</p>
                                </div>
                            </div>
                            <div className="p-4 rounded-xl border border-slate-100 bg-slate-50 flex gap-4">
                                <div className="mt-1 h-8 w-8 shrink-0 rounded-full flex items-center justify-center border bg-blue-50 border-blue-100 text-blue-600">
                                    <Mail className="h-4 w-4" />
                                </div>
                                <div className="flex-1">
                                    <div className="flex justify-between mb-1">
                                        <span className="font-semibold text-sm">Email 送信（あなた）</span>
                                        <span className="text-xs text-slate-400">昨日 10:00</span>
                                    </div>
                                    <p className="text-sm text-slate-600">株式会社テスト 先日ご提案いたしました資料を添付いたします。</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="space-y-6">
                    {/* 自動トラッキングのアクティビティ概要 */}
                    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50">
                            <h2 className="text-base font-bold text-slate-900">エンゲージメント状態</h2>
                        </div>
                        <div className="p-5 space-y-4">
                            <div className="flex justify-between items-center text-sm">
                                <span className="text-slate-500">最終接触日</span>
                                <span className="font-medium text-slate-900">今日 (LINE)</span>
                            </div>
                            <div className="flex justify-between items-center text-sm">
                                <span className="text-slate-500">関連商談数</span>
                                <span className="font-medium text-slate-900">1 件</span>
                            </div>
                            <div className="flex justify-between items-center text-sm">
                                <span className="text-slate-500">アクション頻度</span>
                                <span className="font-medium text-emerald-600 flex items-center gap-1">
                                    <Clock className="w-3.5 h-3.5" /> High
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
