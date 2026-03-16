"use client"

import { useState, useEffect } from "react"
import { X, Calendar, FileText, CreditCard, CheckCircle2, Building2 } from "lucide-react"

interface CreateFreeeInvoiceModalProps {
    isOpen: boolean
    onClose: () => void
    dealInfo: any
    onSubmit: (invoiceData: any) => Promise<void>
    isQuotation?: boolean
}

export default function CreateFreeeInvoiceModal({ isOpen, onClose, dealInfo, onSubmit, isQuotation = false }: CreateFreeeInvoiceModalProps) {
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [formData, setFormData] = useState({
        title: '',
        amount: '',
        quantity: '1',
        unit: '人', // Example from image: 17人
        description: '',
        issue_date: '',
        billing_date: '',
        due_date: '',
        note: ''
    })

    useEffect(() => {
        if (isOpen && dealInfo) {
            const today = new Date()
            const todayStr = today.toISOString().split('T')[0]

            // 翌月末をデフォルトの支払期日にする
            const nextMonthEnd = new Date(today.getFullYear(), today.getMonth() + 2, 0)
            const nextMonthEndStr = nextMonthEnd.toISOString().split('T')[0]

            setFormData({
                title: `${dealInfo.title} の${isQuotation ? '見積書' : '請求書'}`,
                amount: dealInfo.estimated_amount?.toString() || '0',
                quantity: '1',
                unit: '式',
                description: `案件「${dealInfo.title}」のシステム開発・導入費用一式`,
                issue_date: todayStr, // 発行日（デフォルト今日）
                billing_date: todayStr, // 売上計上日（デフォルト今日）
                due_date: nextMonthEndStr, // 支払期日・有効期限（デフォルト翌月末）
                note: isQuotation ? '有効期限：本見積書発行日より30日間' : '誠に恐れ入りますが、振込手数料は貴社にてご負担くださいますようお願い申し上げます。'
            })
        }
    }, [isOpen, dealInfo])

    if (!isOpen) return null

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setIsSubmitting(true)
        try {
            await onSubmit({
                ...formData,
                amount: Number(formData.amount),
                quantity: Number(formData.quantity),
                company_name: dealInfo?.companies?.name || 'テスト受託会社(CRM自動生成)'
            })
        } finally {
            setIsSubmitting(false)
        }
    }

    // 計算用ヘルパー
    const quantity = Number(formData.quantity) || 0;
    const unitPrice = Number(formData.amount) || 0;
    const subtotal = quantity * unitPrice;
    const tax = Math.floor(subtotal * 0.1);
    const total = subtotal + tax;

    const isFormValid = Boolean(
        formData.title.trim() &&
        formData.issue_date &&
        formData.billing_date &&
        formData.due_date &&
        formData.quantity &&
        formData.unit.trim() &&
        formData.amount
    );

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 py-8">
            <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={!isSubmitting ? onClose : undefined} />

            <div className="relative w-full max-w-6xl bg-white rounded-2xl shadow-xl overflow-hidden flex flex-col max-h-[95vh]">
                {/* ヘッダー */}
                <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between shrink-0 bg-slate-50/50">
                    <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-lg bg-blue-100 flex items-center justify-center text-blue-600">
                            <CreditCard className="w-5 h-5" />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-slate-900">{isQuotation ? '見積書' : '請求書'}の発行 (freee連携)</h2>
                            <p className="text-xs text-slate-500 mt-0.5">内容を入力してfreeeにデータを作成します</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        disabled={isSubmitting}
                        className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors disabled:opacity-50"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* メインコンテンツ（2カラム） */}
                <div className="flex-1 overflow-y-auto p-6 flex flex-col lg:flex-row gap-8 bg-slate-50">

                    {/* 左側：入力フォーム */}
                    <div className="w-full lg:w-96 shrink-0 space-y-6">
                        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                            <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2 border-b border-slate-100 pb-3 mb-4">
                                <FileText className="w-4 h-4 text-blue-600" />
                                {isQuotation ? '見積' : '請求'}内容・設定
                            </h3>

                            <form id="invoice-form" onSubmit={handleSubmit} className="space-y-4">
                                <div>
                                    <label className="block text-xs font-semibold text-slate-700 mb-1.5 flex items-center gap-1">
                                        <Building2 className="w-3.5 h-3.5" /> 請求先企業
                                    </label>
                                    <input
                                        type="text"
                                        disabled
                                        className="w-full px-3 py-2 bg-slate-100 border border-slate-200 rounded-lg text-sm text-slate-500 cursor-not-allowed"
                                        value={dealInfo?.companies?.name || 'テスト受託会社(CRM自動生成)'}
                                    />
                                </div>

                                <div>
                                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">件名 <span className="text-red-500">*</span></label>
                                    <input
                                        type="text"
                                        required
                                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                                        value={formData.title}
                                        onChange={e => setFormData({ ...formData, title: e.target.value })}
                                    />
                                </div>

                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="block text-xs font-semibold text-slate-700 mb-1.5">{isQuotation ? '見積日' : '請求日'} (発行日) <span className="text-red-500">*</span></label>
                                        <input
                                            type="date"
                                            required
                                            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                                            value={formData.issue_date}
                                            onChange={e => setFormData({ ...formData, issue_date: e.target.value })}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-slate-700 mb-1.5">売上計上日 <span className="text-red-500">*</span></label>
                                        <input
                                            type="date"
                                            required
                                            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                                            value={formData.billing_date}
                                            onChange={e => setFormData({ ...formData, billing_date: e.target.value })}
                                        />
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="col-span-2">
                                        <label className="block text-xs font-semibold text-slate-700 mb-1.5">{isQuotation ? '有効期限' : '入金期日 (支払期日)'} <span className="text-red-500">*</span></label>
                                        <input
                                            type="date"
                                            required
                                            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm border-blue-200 bg-blue-50/50 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                                            value={formData.due_date}
                                            onChange={e => setFormData({ ...formData, due_date: e.target.value })}
                                        />
                                    </div>
                                </div>

                                <div className="mt-6 pt-4 border-t border-slate-100">
                                    <h4 className="text-xs font-bold text-slate-800 mb-3">明細行 (1行のみ対応)</h4>
                                </div>

                                <div>
                                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">摘要 (品目)</label>
                                    <input
                                        type="text"
                                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                                        value={formData.description}
                                        onChange={e => setFormData({ ...formData, description: e.target.value })}
                                    />
                                </div>

                                <div className="grid grid-cols-3 gap-3">
                                    <div>
                                        <label className="block text-xs font-semibold text-slate-700 mb-1.5">数量 <span className="text-red-500">*</span></label>
                                        <input
                                            type="number"
                                            required
                                            min="1"
                                            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                                            value={formData.quantity}
                                            onChange={e => setFormData({ ...formData, quantity: e.target.value })}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-slate-700 mb-1.5">単位 <span className="text-red-500">*</span></label>
                                        <input
                                            type="text"
                                            required
                                            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-center"
                                            value={formData.unit}
                                            onChange={e => setFormData({ ...formData, unit: e.target.value })}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-slate-700 mb-1.5">単価(税抜) <span className="text-red-500">*</span></label>
                                        <input
                                            type="number"
                                            required
                                            min="0"
                                            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-right"
                                            value={formData.amount}
                                            onChange={e => setFormData({ ...formData, amount: e.target.value })}
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">備考 (振込先など)</label>
                                    <textarea
                                        rows={3}
                                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                                        value={formData.note}
                                        onChange={e => setFormData({ ...formData, note: e.target.value })}
                                    />
                                </div>
                            </form>
                        </div>
                    </div>

                    {/* 右側：実物プレビュー */}
                    <div className="flex-1 flex justify-center overflow-auto items-start">
                        <div className="w-[794px] min-h-[1123px] bg-white shadow-md border border-slate-300 p-12 relative flex flex-col scale-[0.8] origin-top md:scale-100 transition-all font-sans" style={{ fontFamily: '"Hiragino Sans", "Noto Sans JP", sans-serif' }}>
                            {/* 印影風の透かし */}
                            <div className="absolute right-12 top-28 opacity-10 pointer-events-none">
                                <div className="w-24 h-24 rounded-full border-[3px] border-red-600 flex items-center justify-center text-red-600 font-serif text-3xl opacity-50 rotate-[-15deg]">印</div>
                            </div>

                            <div className="text-center mb-16">
                                <h1 className="text-3xl font-medium tracking-[0.5em] ml-[0.5em]">{isQuotation ? '見積書' : '請求書'}</h1>
                            </div>

                            <div className="flex justify-between items-start mb-8">
                                <div className="space-y-6">
                                    <div className="text-xl font-medium border-b border-black pb-1 max-w-fit pr-8">
                                        {dealInfo?.companies?.name || 'テスト株式会社'} 御中
                                    </div>
                                    <div className="text-sm">
                                        <div>{dealInfo?.companies?.postal_code ? `〒${dealInfo.companies.postal_code}` : '〒----'}</div>
                                        <div>{dealInfo?.companies?.address || '住所未登録'}</div>
                                    </div>
                                </div>

                                <div className="text-sm space-y-1.5">
                                    <div className="flex justify-between w-48">
                                        <span>{isQuotation ? '見積日' : '請求日'}</span>
                                        <span>{formData.issue_date || '----/--/--'}</span>
                                    </div>
                                    <div className="flex justify-between w-48">
                                        <span>{isQuotation ? '見積書' : '請求書'}番号</span>
                                        <span>{isQuotation ? 'QUO' : 'INV'}-XXXXXXXX</span>
                                    </div>
                                    <div className="flex justify-between w-48">
                                        <span>登録番号</span>
                                        <span>T0000000000000</span>
                                    </div>
                                </div>
                            </div>

                            <div className="flex justify-between items-end mb-4">
                                <div className="space-y-4 flex-1">
                                    <div className="text-sm">下記の通りご{isQuotation ? '提案' : '請求'}申し上げます。</div>
                                    <div className="flex">
                                        <div className="w-16 text-sm">件名</div>
                                        <div className="text-sm font-medium">{formData.title || '(件名未入力)'}</div>
                                    </div>
                                    <div className="flex items-baseline border-b border-black pb-1 max-w-fit">
                                        <div className="w-16 text-sm">{isQuotation ? '御見積' : '請求'}金額</div>
                                        <div className="text-2xl font-bold px-8">¥ {total.toLocaleString()}</div>
                                    </div>
                                </div>

                                <div className="text-sm space-y-1 relative">
                                    <div className="font-bold text-base mb-2">
                                        株式会社Rework
                                    </div>
                                    <div>担当: 澤田 翔</div> {/* Example name */}
                                    <div>〒792-0013</div>
                                    <div>愛媛県新居浜市泉池町5-13</div>

                                    {/* 実際の印鑑イメージへのプレースホルダー */}
                                    <div className="absolute top-2 right-[-2rem] w-16 h-16 border-2 border-red-500 rounded text-red-500 text-[10px] leading-tight flex items-center justify-center p-1 font-serif" style={{ writingMode: "vertical-rl" }}>
                                        合同会社印
                                    </div>
                                </div>
                            </div>

                            {/* 明細テーブル */}
                            <table className="w-full border-collapse border border-black text-sm mb-6">
                                <thead>
                                    <tr className="border-b border-black text-center">
                                        <th className="border-r border-black font-normal py-1.5 w-[50%]">摘要</th>
                                        <th className="border-r border-black font-normal py-1.5 w-[15%]">数量</th>
                                        <th className="border-r border-black font-normal py-1.5 w-[15%]">単価</th>
                                        <th className="font-normal py-1.5 w-[20%]">明細金額</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr className="border-b border-black h-8">
                                        <td className="border-r border-black px-2">{formData.description}</td>
                                        <td className="border-r border-black text-center">{formData.quantity} {formData.unit}</td>
                                        <td className="border-r border-black text-right px-2">{unitPrice.toLocaleString()}</td>
                                        <td className="text-right px-2">{subtotal.toLocaleString()}</td>
                                    </tr>
                                    {/* Empty rows for layout */}
                                    {[...Array(9)].map((_, i) => (
                                        <tr key={i} className="border-b border-black h-7">
                                            <td className="border-r border-black"></td><td className="border-r border-black"></td><td className="border-r border-black"></td><td></td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>

                            <div className="flex justify-between items-start">
                                <div className="text-sm space-y-2">
                                    <div className="flex">
                                        <span className="w-20">{isQuotation ? '有効期限' : '入金期日'}</span>
                                        <span className="font-bold">{formData.due_date || '----/--/--'}</span>
                                    </div>
                                    {!isQuotation && (
                                        <div className="flex">
                                            <span className="w-20">振込先</span>
                                            <span>
                                                GMOあおぞらネット銀行<br />
                                                法人営業部<br />
                                                口座番号: 1155224<br />
                                                株式会社Rework
                                            </span>
                                        </div>
                                    )}
                                </div>

                                <table className="w-72 border-collapse border border-black text-sm">
                                    <tbody>
                                        <tr className="border-b border-black">
                                            <td className="border-r border-black py-1 px-2">小計</td>
                                            <td className="text-right px-2">{subtotal.toLocaleString()}円</td>
                                        </tr>
                                        <tr className="border-b border-black">
                                            <td className="border-r border-black py-1 px-2">消費税</td>
                                            <td className="text-right px-2">{tax.toLocaleString()}円</td>
                                        </tr>
                                        <tr className="border-b border-black font-bold">
                                            <td className="border-r border-black py-1 px-2">合計</td>
                                            <td className="text-right px-2 bg-slate-100">{total.toLocaleString()}円</td>
                                        </tr>
                                        <tr>
                                            <td className="border-r border-black py-1 px-2 text-xs">内訳<span className="ml-2">10%対象(税抜)</span></td>
                                            <td className="text-right px-2 text-xs">{subtotal.toLocaleString()}円</td>
                                        </tr>
                                        <tr>
                                            <td className="border-r border-black py-0.5 px-2 text-[10px]"><span className="ml-[34px]">10%消費税</span></td>
                                            <td className="text-right px-2 text-[10px]">{tax.toLocaleString()}円</td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>

                            <div className="mt-8 border border-black p-3 text-sm">
                                <div className="font-medium mb-1">備考</div>
                                <div className="whitespace-pre-wrap text-slate-700">{formData.note}</div>
                            </div>

                            <div className="mt-auto pt-8 text-center text-sm text-slate-500">
                                1 / 1
                            </div>
                        </div>
                    </div>
                </div>

                {/* フッター（アクション） */}
                <div className="px-6 py-4 border-t border-slate-100 bg-white flex justify-between items-center shrink-0">
                    <div className="text-sm font-medium">
                        {!isFormValid && (
                            <span className="text-red-500 flex items-center gap-1.5 bg-red-50 px-3 py-1.5 rounded-md border border-red-100">
                                <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse"></span>
                                全ての必須項目（件名、日付、数量、単位、単価など）をご入力ください
                            </span>
                        )}
                    </div>
                    <div className="flex gap-3">
                        <button
                            type="button"
                            onClick={onClose}
                            disabled={isSubmitting}
                            className="px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-50 transition-colors disabled:opacity-50"
                        >
                            キャンセル
                        </button>
                        <button
                            type="submit"
                            form="invoice-form"
                            disabled={isSubmitting || !isFormValid}
                            className={`px-6 py-2 rounded-lg text-sm font-medium transition-colors shadow-sm flex items-center gap-2 
                                ${isFormValid
                                    ? 'bg-blue-600 text-white hover:bg-blue-700'
                                    : 'bg-slate-300 text-slate-500 cursor-not-allowed opacity-80'}`}
                        >
                            {isSubmitting ? (
                                <>処理中...</>
                            ) : (
                                <>
                                    <CreditCard className="w-4 h-4" />
                                    freeeにこの内容で登録・発行する
                                </>
                            )}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
}
