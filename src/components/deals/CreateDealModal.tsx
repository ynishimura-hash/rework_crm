"use client"

import { useState } from "react"
import { X, Briefcase, Building2, CircleDollarSign, User, CalendarDays, FileText, Banknote } from "lucide-react"

interface CreateDealModalProps {
    isOpen: boolean
    onClose: () => void
    onSubmit: (formData: FormData) => Promise<void>
}

export default function CreateDealModal({ isOpen, onClose, onSubmit }: CreateDealModalProps) {
    const [isSubmitting, setIsSubmitting] = useState(false)

    if (!isOpen) return null

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault()
        setIsSubmitting(true)

        try {
            const formData = new FormData(e.currentTarget)
            await onSubmit(formData)
            onClose()
        } catch (error) {
            console.error(error)
            alert("エラーが発生しました。")
        } finally {
            setIsSubmitting(false)
        }
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-0">
            {/* Backdrop */}
            <div
                className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm transition-opacity"
                onClick={onClose}
            />

            {/* Modal */}
            <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden transform transition-all">
                <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                    <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                        <Briefcase className="w-5 h-5 text-blue-600" />
                        新規商談の作成
                    </h2>
                    <button
                        onClick={onClose}
                        className="text-slate-400 hover:text-slate-600 p-2 rounded-lg hover:bg-slate-100 transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-5 max-h-[70vh] overflow-y-auto">
                    <div className="space-y-4">
                        <div>
                            <label htmlFor="title" className="block text-sm font-medium text-slate-700 mb-1">
                                商談タイトル <span className="text-red-500">*</span>
                            </label>
                            <input
                                type="text"
                                id="title"
                                name="title"
                                required
                                placeholder="例：AI定額制研修の導入"
                                className="w-full px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all placeholder:text-slate-400"
                            />
                        </div>

                        <div>
                            <label htmlFor="companyName" className="block text-sm font-medium text-slate-700 mb-1 flex items-center gap-1">
                                企業・取引先 <span className="text-red-500">*</span>
                            </label>
                            <div className="relative">
                                <Building2 className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                                <input
                                    type="text"
                                    id="companyName"
                                    name="companyName"
                                    required
                                    placeholder="例：株式会社○○"
                                    className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all placeholder:text-slate-400"
                                />
                            </div>
                        </div>

                        {/* 連絡先 */}
                        <div>
                            <label htmlFor="contact_id" className="block text-sm font-medium text-slate-700 mb-1 flex items-center gap-1">
                                連絡先
                            </label>
                            <div className="relative">
                                <User className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                                <input
                                    type="text"
                                    id="contact_id"
                                    name="contact_id"
                                    placeholder="例：担当者名またはID"
                                    className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all placeholder:text-slate-400"
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label htmlFor="amount" className="block text-sm font-medium text-slate-700 mb-1 flex items-center gap-1">
                                    見込金額 (円)
                                </label>
                                <div className="relative">
                                    <CircleDollarSign className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                                    <input
                                        type="number"
                                        id="amount"
                                        name="amount"
                                        min="0"
                                        placeholder="150000"
                                        className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all placeholder:text-slate-400"
                                    />
                                </div>
                            </div>

                            {/* 見込み予測金額 */}
                            <div>
                                <label htmlFor="expected_amount" className="block text-sm font-medium text-slate-700 mb-1 flex items-center gap-1">
                                    見込み予測金額 (円)
                                </label>
                                <div className="relative">
                                    <Banknote className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                                    <input
                                        type="number"
                                        id="expected_amount"
                                        name="expected_amount"
                                        min="0"
                                        placeholder="200000"
                                        className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all placeholder:text-slate-400"
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label htmlFor="status" className="block text-sm font-medium text-slate-700 mb-1">
                                    初期ステータス
                                </label>
                                <select
                                    id="status"
                                    name="status"
                                    className="w-full px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all appearance-none"
                                >
                                    <option value="提案">提案</option>
                                    <option value="見積作成">見積作成</option>
                                    <option value="契約書/計画届">契約書/計画届</option>
                                    <option value="成約">成約</option>
                                </select>
                            </div>

                            {/* 入金期日 */}
                            <div>
                                <label htmlFor="payment_due_date" className="block text-sm font-medium text-slate-700 mb-1 flex items-center gap-1">
                                    入金期日
                                </label>
                                <div className="relative">
                                    <Banknote className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                                    <input
                                        type="date"
                                        id="payment_due_date"
                                        name="payment_due_date"
                                        className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* アポイント日 */}
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label htmlFor="first_appointment_date" className="block text-sm font-medium text-slate-700 mb-1 flex items-center gap-1">
                                    初回アポ日
                                </label>
                                <div className="relative">
                                    <CalendarDays className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                                    <input
                                        type="date"
                                        id="first_appointment_date"
                                        name="first_appointment_date"
                                        className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                                    />
                                </div>
                            </div>

                            <div>
                                <label htmlFor="next_appointment_date" className="block text-sm font-medium text-slate-700 mb-1 flex items-center gap-1">
                                    次回アポ日
                                </label>
                                <div className="relative">
                                    <CalendarDays className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                                    <input
                                        type="date"
                                        id="next_appointment_date"
                                        name="next_appointment_date"
                                        className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* 次回までのアクションプラン */}
                        <div>
                            <label htmlFor="action_plan" className="block text-sm font-medium text-slate-700 mb-1 flex items-center gap-1">
                                <FileText className="w-4 h-4 text-slate-400" />
                                次回までのアクションプラン
                            </label>
                            <textarea
                                id="action_plan"
                                name="action_plan"
                                rows={3}
                                placeholder="例：見積書を送付し、1週間後にフォローアップの電話をする"
                                className="w-full px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all placeholder:text-slate-400 resize-none"
                            />
                        </div>
                    </div>

                    <div className="pt-4 flex items-center justify-end gap-3 border-t border-slate-100">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-5 py-2.5 text-sm font-medium text-slate-600 hover:text-slate-900 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
                        >
                            キャンセル
                        </button>
                        <button
                            type="submit"
                            disabled={isSubmitting}
                            className="px-5 py-2.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center min-w-[120px]"
                        >
                            {isSubmitting ? (
                                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            ) : (
                                "商談を作成"
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    )
}
