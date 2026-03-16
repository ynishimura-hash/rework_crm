"use client"

import { useState, useEffect } from "react"
import { CreditCard, RefreshCw, Calendar, ArrowRight, Search, Zap, Link2 } from "lucide-react"

interface WalletTxn {
    id: number
    company_id: number
    date: string
    amount: number
    due_amount: number
    balance: number
    entry_side: string
    walletable_type: string
    walletable_id: number
    description: string
    status: number
}

export default function FreeePaymentsPage() {
    const [txns, setTxns] = useState<WalletTxn[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [isRefreshing, setIsRefreshing] = useState(false)
    const [isReconciling, setIsReconciling] = useState(false)
    const [isAutoLinking, setIsAutoLinking] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const fetchPayments = async (isRefresh = false) => {
        if (isRefresh) setIsRefreshing(true)
        else setIsLoading(true)
        setError(null)

        try {
            const res = await fetch(`/api/freee/wallet-txns?limit=50`)
            if (res.status === 401) {
                setError('freeeの認証が切れています。再認証してください。')
                return
            }
            const data = await res.json()
            if (data.success && data.data) {
                setTxns(data.data)
            } else {
                setError(data.error || '入金履歴の取得に失敗しました')
            }
        } catch (e) {
            console.error("Failed to fetch freee wallet txns", e)
            setError('通信エラーが発生しました')
        } finally {
            setIsLoading(false)
            setIsRefreshing(false)
        }
    }

    const handleAutoReconcile = async () => {
        if (!window.confirm('自動消込を実行します。\n入金明細と未入金請求書を照合し、金額・名義が一致するものを自動的に入金済みにします。\n\n実行しますか？')) return
        setIsReconciling(true)
        try {
            const res = await fetch('/api/freee/auto-reconcile', { method: 'POST' })
            if (res.status === 401) {
                setError('freeeの認証が切れています。再認証してください。')
                return
            }
            const data = await res.json()
            if (data.success) {
                const s = data.summary
                alert(`自動消込完了\n\n入金明細: ${s.total_txns}件\n未入金請求書: ${s.total_unsettled}件\nマッチ: ${s.matched}件\n消込成功: ${s.reconciled}件\nスキップ: ${s.skipped}件\nエラー: ${s.errors}件`)
                fetchPayments(true)
            } else {
                alert(data.error || '自動消込に失敗しました。')
            }
        } catch {
            alert('通信エラーが発生しました。')
        } finally {
            setIsReconciling(false)
        }
    }

    const handleAutoLink = async () => {
        if (!window.confirm('未連携の商談に対して、freee上の見積書・請求書を金額+社名で自動マッチして連携します。\n\n実行しますか？')) return
        setIsAutoLinking(true)
        try {
            const res = await fetch('/api/freee/auto-link-documents', { method: 'POST' })
            if (res.status === 401) {
                setError('freeeの認証が切れています。再認証してください。')
                return
            }
            const data = await res.json()
            if (data.success) {
                const s = data.summary
                alert(`自動連携完了\n\n対象商談: ${s.target}件\n連携成功: ${s.linked}件（見積書: ${s.linked_quotations}件, 請求書: ${s.linked_invoices}件）\nマッチなし: ${s.no_match}件\nエラー: ${s.errors}件`)
            } else {
                alert(data.error || '自動連携に失敗しました。')
            }
        } catch {
            alert('通信エラーが発生しました。')
        } finally {
            setIsAutoLinking(false)
        }
    }

    useEffect(() => {
        fetchPayments()
    }, [])

    // 合計金額計算
    const totalAmount = txns.reduce((sum, txn) => sum + txn.amount, 0)

    return (
        <div className="space-y-6 pb-10">
            {/* ヘッダーエリア */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl">
                        <CreditCard className="w-6 h-6" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-slate-900">入金記録 (freee連携)</h1>
                        <p className="text-sm text-slate-500 mt-1">freeeから同期された銀行口座の入金データを閲覧できます</p>
                    </div>
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={handleAutoLink}
                        disabled={isLoading || isAutoLinking}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors shadow-sm flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                        <Link2 className={`w-4 h-4 ${isAutoLinking ? 'animate-pulse' : ''}`} />
                        {isAutoLinking ? '連携中...' : '書類自動連携'}
                    </button>
                    <button
                        onClick={handleAutoReconcile}
                        disabled={isLoading || isReconciling}
                        className="px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 transition-colors shadow-sm flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                        <Zap className={`w-4 h-4 ${isReconciling ? 'animate-pulse' : ''}`} />
                        {isReconciling ? '消込中...' : '自動消込'}
                    </button>
                    <button
                        onClick={() => fetchPayments(true)}
                        disabled={isLoading || isRefreshing}
                        className="px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-50 transition-colors shadow-sm flex items-center justify-center gap-2"
                    >
                        <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                        最新情報を取得
                    </button>
                    {error?.includes('認証') && (
                        <a
                            href="/api/freee/auth"
                            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors shadow-sm flex items-center justify-center"
                        >
                            freee再認証
                        </a>
                    )}
                </div>
            </div>

            {/* サマリーカード */}
            {!isLoading && !error && txns.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
                        <div className="text-xs text-slate-500 mb-1">取得件数</div>
                        <div className="text-2xl font-bold text-slate-900">{txns.length}<span className="text-sm font-normal text-slate-500 ml-1">件</span></div>
                    </div>
                    <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
                        <div className="text-xs text-slate-500 mb-1">入金総額</div>
                        <div className="text-2xl font-bold text-emerald-600">¥{totalAmount.toLocaleString()}</div>
                    </div>
                    <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
                        <div className="text-xs text-slate-500 mb-1">最新入金日</div>
                        <div className="text-2xl font-bold text-slate-900">{txns[0]?.date || '---'}</div>
                    </div>
                </div>
            )}

            {/* データ表示エリア */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                {isLoading ? (
                    <div className="p-12 text-center">
                        <div className="inline-block p-4 rounded-full bg-slate-50 mb-4">
                            <RefreshCw className="w-8 h-8 text-emerald-600 animate-spin mx-auto" />
                        </div>
                        <h3 className="text-lg font-medium text-slate-900 mb-1">データを読み込み中</h3>
                        <p className="text-sm text-slate-500">freeeから入金履歴を取得しています...</p>
                    </div>
                ) : error ? (
                    <div className="p-12 text-center">
                        <div className="inline-block p-4 rounded-full bg-red-50 mb-4">
                            <CreditCard className="w-8 h-8 text-red-600 mx-auto" />
                        </div>
                        <h3 className="text-lg font-medium text-slate-900 mb-1">エラーが発生しました</h3>
                        <p className="text-sm text-slate-500 mb-4">{error}</p>
                    </div>
                ) : txns.length === 0 ? (
                    <div className="p-12 text-center">
                        <div className="inline-block p-4 rounded-full bg-slate-50 mb-4">
                            <Search className="w-8 h-8 text-slate-400 mx-auto" />
                        </div>
                        <h3 className="text-lg font-medium text-slate-900 mb-1">入金データが見つかりません</h3>
                        <p className="text-sm text-slate-500">連携された口座に入金履歴が存在しないか、freee側で口座同期が完了していません。</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-slate-50 border-b border-slate-200 text-sm font-semibold text-slate-600">
                                    <th className="p-4 pl-6 font-medium">取引日</th>
                                    <th className="p-4 font-medium">取引先・摘要</th>
                                    <th className="p-4 font-medium text-right">入金額</th>
                                    <th className="p-4 font-medium text-right">残高</th>
                                    <th className="p-4 pr-6 font-medium text-center">登録状態</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {txns.map((txn) => (
                                    <tr key={txn.id} className="hover:bg-slate-50 transition-colors">
                                        <td className="p-4 pl-6 text-sm text-slate-600 whitespace-nowrap">
                                            <div className="flex items-center gap-2">
                                                <Calendar className="w-4 h-4 text-slate-400" />
                                                {txn.date}
                                            </div>
                                        </td>
                                        <td className="p-4 text-sm font-medium text-slate-900">
                                            {txn.description || '—'}
                                        </td>
                                        <td className="p-4 text-sm font-bold text-emerald-600 text-right whitespace-nowrap">
                                            +¥{txn.amount.toLocaleString()}
                                        </td>
                                        <td className="p-4 text-sm text-slate-500 text-right whitespace-nowrap">
                                            {txn.balance != null ? `¥${txn.balance.toLocaleString()}` : '—'}
                                        </td>
                                        <td className="p-4 pr-6 text-center">
                                            {txn.status === 1 ? (
                                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                                    登録済
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                                                    未登録
                                                </span>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                {!isLoading && !error && txns.length > 0 && (
                    <div className="p-4 border-t border-slate-200 bg-slate-50 flex justify-between items-center text-sm text-slate-500">
                        <span>全 {txns.length} 件を表示中（直近最大50件）</span>
                        <a href="https://secure.freee.co.jp/wallet_txns" target="_blank" rel="noopener noreferrer" className="text-blue-600 font-medium hover:underline flex items-center gap-1">
                            freeeで全件を確認する
                            <ArrowRight className="w-3.5 h-3.5" />
                        </a>
                    </div>
                )}
            </div>
        </div>
    )
}
