"use client"

import { useState, useEffect, useCallback } from "react"
import {
    MessageSquare, Search, Plus, Mail, MessageCircle,
    Calendar, RefreshCw, Send, X, ChevronLeft, ChevronRight,
    Paperclip, Eye, ArrowUpRight, ArrowDownLeft,
    Link2, Loader2, CheckCircle2, AlertCircle, Inbox
} from "lucide-react"

interface Communication {
    id: string
    contact_id: string | null
    company_id: string | null
    channel_type: string
    direction: string
    subject: string | null
    content: string
    sent_at: string
    is_read: boolean
    thread_id: string | null
    external_message_id: string | null
    sender_email: string | null
    recipient_email: string | null
    attachments: { filename: string; mimeType: string; size: number }[]
    contacts?: { id: string; name: string; email: string | null } | null
    companies?: { id: string; name: string } | null
}

interface Contact {
    id: string
    name: string
    email: string | null
    companies?: { id: string; name: string } | null
}

type ChannelFilter = "ALL" | "EMAIL" | "LINE"

export default function CommunicationsPage() {
    const [communications, setCommunications] = useState<Communication[]>([])
    const [total, setTotal] = useState(0)
    const [currentPage, setCurrentPage] = useState(1)
    const [channelFilter, setChannelFilter] = useState<ChannelFilter>("ALL")
    const [searchQuery, setSearchQuery] = useState("")
    const [loading, setLoading] = useState(true)
    const [syncing, setSyncing] = useState(false)
    const [gmailConnected, setGmailConnected] = useState(false)
    const [gmailEmail, setGmailEmail] = useState("")
    const [selectedComm, setSelectedComm] = useState<Communication | null>(null)
    const [showCompose, setShowCompose] = useState(false)
    const [contacts, setContacts] = useState<Contact[]>([])
    const [unreadCount, setUnreadCount] = useState({ email: 0, line: 0 })

    const limit = 20

    // コミュニケーション一覧を取得
    const fetchCommunications = useCallback(async () => {
        setLoading(true)
        try {
            const params = new URLSearchParams({
                page: currentPage.toString(),
                limit: limit.toString(),
            })
            if (channelFilter !== "ALL") params.set("channelType", channelFilter)
            if (searchQuery) params.set("search", searchQuery)

            const res = await fetch(`/api/communications?${params}`)
            const data = await res.json()
            setCommunications(data.data || [])
            setTotal(data.total || 0)
        } catch {
            console.error("コミュニケーション取得に失敗")
        } finally {
            setLoading(false)
        }
    }, [currentPage, channelFilter, searchQuery])

    // Gmail接続状態を確認
    const checkGmailStatus = useCallback(async () => {
        try {
            const res = await fetch("/api/gmail/messages?maxResults=1")
            const data = await res.json()
            setGmailConnected(data.connected || false)
            setGmailEmail(data.email || "")
        } catch {
            setGmailConnected(false)
        }
    }, [])

    // 未読数を取得
    const fetchUnreadCount = useCallback(async () => {
        try {
            const res = await fetch("/api/communications/unread")
            const data = await res.json()
            setUnreadCount({ email: data.email || 0, line: data.line || 0 })
        } catch {
            // エラー時はデフォルト値のまま
        }
    }, [])

    // 担当者リストを取得（メール作成時の宛先候補）
    const fetchContacts = useCallback(async () => {
        try {
            const res = await fetch("/api/communications/contacts")
            const data = await res.json()
            setContacts(data || [])
        } catch {
            // エラー時は空のまま
        }
    }, [])

    useEffect(() => {
        fetchCommunications()
    }, [fetchCommunications])

    useEffect(() => {
        checkGmailStatus()
        fetchUnreadCount()
        fetchContacts()
    }, [checkGmailStatus, fetchUnreadCount, fetchContacts])

    // Gmail同期
    const handleSync = async () => {
        setSyncing(true)
        try {
            const res = await fetch("/api/gmail/sync", { method: "POST" })
            const data = await res.json()
            if (data.success) {
                await fetchCommunications()
                await fetchUnreadCount()
            }
        } catch {
            console.error("同期に失敗")
        } finally {
            setSyncing(false)
        }
    }

    // 既読にする
    const handleMarkRead = async (comm: Communication) => {
        if (comm.is_read) return
        try {
            await fetch("/api/communications/mark-read", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id: comm.id }),
            })
            setCommunications(prev =>
                prev.map(c => c.id === comm.id ? { ...c, is_read: true } : c)
            )
            fetchUnreadCount()
        } catch {
            // エラー時はスキップ
        }
    }

    const totalPages = Math.ceil(total / limit) || 1

    // 日時フォーマット
    const formatDate = (dateStr: string) => {
        const d = new Date(dateStr)
        const now = new Date()
        const isToday = d.toDateString() === now.toDateString()
        if (isToday) {
            return d.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })
        }
        return d.toLocaleDateString("ja-JP", { month: "short", day: "numeric" })
    }

    return (
        <div className="space-y-4 md:space-y-6">
            {/* ヘッダー */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                    <h1 className="text-xl md:text-2xl font-bold text-slate-900 flex items-center gap-2">
                        <MessageSquare className="w-5 h-5 md:w-6 md:h-6 text-blue-600" />
                        コミュニケーション
                    </h1>
                    <p className="text-xs md:text-sm text-slate-500 mt-1">
                        メール・LINEの全コミュニケーション履歴
                    </p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                    {gmailConnected && (
                        <button
                            onClick={handleSync}
                            disabled={syncing}
                            className="flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-200 text-slate-700 rounded-lg text-xs md:text-sm font-medium hover:bg-slate-50 transition-colors disabled:opacity-50"
                        >
                            <RefreshCw className={`w-3.5 h-3.5 ${syncing ? "animate-spin" : ""}`} />
                            {syncing ? "同期中..." : "Gmail同期"}
                        </button>
                    )}
                    <button
                        onClick={() => setShowCompose(true)}
                        className="flex items-center gap-1.5 px-3 py-2 md:px-4 md:py-2.5 bg-blue-600 text-white rounded-lg text-xs md:text-sm font-medium hover:bg-blue-700 transition-colors shadow-sm"
                    >
                        <Plus className="w-3.5 h-3.5" />
                        メール作成
                    </button>
                </div>
            </div>

            {/* Gmail未接続バナー */}
            {!gmailConnected && !loading && (
                <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl border border-blue-100 p-4 md:p-6">
                    <div className="flex items-start gap-3 md:gap-4">
                        <div className="p-2 md:p-3 bg-blue-100 rounded-xl">
                            <Mail className="w-5 h-5 md:w-6 md:h-6 text-blue-600" />
                        </div>
                        <div className="flex-1">
                            <h3 className="text-sm md:text-base font-semibold text-slate-900">Gmailを接続して全メールを一括管理</h3>
                            <p className="text-xs md:text-sm text-slate-600 mt-1">
                                Googleアカウントを接続すると、メールの閲覧・送信・顧客への自動紐付けが可能になります。
                            </p>
                            <a
                                href="/api/gmail/auth"
                                className="inline-flex items-center gap-2 mt-3 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
                            >
                                <Mail className="w-4 h-4" />
                                Gmailを接続する
                            </a>
                        </div>
                    </div>
                </div>
            )}

            {/* Gmail接続済みインジケーター */}
            {gmailConnected && (
                <div className="flex items-center gap-2 text-xs text-slate-500">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                    <span>Gmail接続中: {gmailEmail}</span>
                </div>
            )}

            {/* チャネルフィルタータブ + 検索 */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-3 md:p-4 flex flex-col sm:flex-row gap-3 justify-between items-stretch sm:items-center">
                <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1">
                    <button
                        onClick={() => { setChannelFilter("ALL"); setCurrentPage(1) }}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs md:text-sm font-medium transition-all ${
                            channelFilter === "ALL" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
                        }`}
                    >全て</button>
                    <button
                        onClick={() => { setChannelFilter("EMAIL"); setCurrentPage(1) }}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs md:text-sm font-medium transition-all ${
                            channelFilter === "EMAIL" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
                        }`}
                    >
                        <Mail className="w-3.5 h-3.5" />
                        メール
                        {unreadCount.email > 0 && (
                            <span className="px-1.5 py-0.5 bg-rose-100 text-rose-600 rounded-full text-[10px] font-bold">{unreadCount.email}</span>
                        )}
                    </button>
                    <button
                        onClick={() => { setChannelFilter("LINE"); setCurrentPage(1) }}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs md:text-sm font-medium transition-all ${
                            channelFilter === "LINE" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
                        }`}
                    >
                        <MessageCircle className="w-3.5 h-3.5" />
                        LINE
                        {unreadCount.line > 0 && (
                            <span className="px-1.5 py-0.5 bg-rose-100 text-rose-600 rounded-full text-[10px] font-bold">{unreadCount.line}</span>
                        )}
                    </button>
                </div>
                <div className="relative flex-1 max-w-md">
                    <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1) }}
                        placeholder="件名、本文、メールアドレスで検索..."
                        className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all placeholder:text-slate-400"
                    />
                </div>
            </div>

            {/* メール一覧 */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                {loading ? (
                    <div className="flex items-center justify-center py-20">
                        <Loader2 className="w-6 h-6 text-blue-500 animate-spin" />
                        <span className="ml-2 text-sm text-slate-500">読み込み中...</span>
                    </div>
                ) : communications.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 md:py-20 text-center px-4">
                        <div className="p-4 bg-slate-100 rounded-2xl mb-4">
                            <Inbox className="w-8 h-8 text-slate-400" />
                        </div>
                        <h3 className="text-sm font-semibold text-slate-700">メッセージがありません</h3>
                        <p className="text-xs text-slate-500 mt-1 max-w-sm">
                            {gmailConnected
                                ? "「Gmail同期」ボタンでメールを取り込んでください。"
                                : "Gmailを接続するとメールの閲覧・管理ができます。"
                            }
                        </p>
                    </div>
                ) : (
                    <>
                        {/* デスクトップ: テーブル表示 */}
                        <div className="hidden md:block overflow-x-auto">
                            <table className="min-w-full divide-y divide-slate-200">
                                <thead className="bg-slate-50/50">
                                    <tr>
                                        <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider w-1/2">
                                            件名 / プレビュー
                                        </th>
                                        <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                                            送信者 / 宛先
                                        </th>
                                        <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                                            日時
                                        </th>
                                        <th className="px-5 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider w-20">
                                            状態
                                        </th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {communications.map((comm) => {
                                        const isLine = comm.channel_type === "LINE"
                                        const isOutbound = comm.direction === "OUTBOUND"
                                        const contactName = comm.contacts?.name
                                        const displayEmail = isOutbound ? comm.recipient_email : comm.sender_email

                                        return (
                                            <tr
                                                key={comm.id}
                                                onClick={() => {
                                                    setSelectedComm(comm)
                                                    handleMarkRead(comm)
                                                }}
                                                className={`hover:bg-slate-50/80 transition-colors cursor-pointer ${
                                                    !comm.is_read ? "bg-blue-50/30" : ""
                                                }`}
                                            >
                                                <td className="px-5 py-3.5">
                                                    <div className="flex items-start gap-3">
                                                        <div className={`mt-0.5 h-8 w-8 shrink-0 rounded-full flex items-center justify-center border ${
                                                            isLine
                                                                ? "bg-emerald-50 border-emerald-100 text-emerald-600"
                                                                : "bg-blue-50 border-blue-100 text-blue-600"
                                                        }`}>
                                                            {isLine ? <MessageCircle className="h-4 w-4" /> : <Mail className="h-4 w-4" />}
                                                        </div>
                                                        <div className="min-w-0 flex-1">
                                                            <div className={`text-sm line-clamp-1 ${!comm.is_read ? "font-bold text-slate-900" : "font-medium text-slate-700"}`}>
                                                                {comm.subject || "(件名なし)"}
                                                            </div>
                                                            <div className="text-xs text-slate-500 mt-0.5 line-clamp-1">
                                                                {comm.content?.substring(0, 100) || ""}
                                                            </div>
                                                            {comm.attachments && comm.attachments.length > 0 && (
                                                                <div className="flex items-center gap-1 mt-1 text-xs text-slate-400">
                                                                    <Paperclip className="w-3 h-3" />
                                                                    <span>{comm.attachments.length}件の添付</span>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-5 py-3.5">
                                                    <div className="flex items-center gap-1.5">
                                                        {isOutbound
                                                            ? <ArrowUpRight className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                                                            : <ArrowDownLeft className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                                                        }
                                                        <div>
                                                            <div className="text-sm font-medium text-slate-900 truncate max-w-[180px]">
                                                                {contactName || displayEmail || "-"}
                                                            </div>
                                                            {contactName && displayEmail && (
                                                                <div className="text-xs text-slate-500 truncate max-w-[180px]">{displayEmail}</div>
                                                            )}
                                                            {comm.companies && (
                                                                <div className="text-xs text-slate-400 truncate max-w-[180px]">{comm.companies.name}</div>
                                                            )}
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-5 py-3.5 whitespace-nowrap">
                                                    <div className="text-sm text-slate-700">{formatDate(comm.sent_at)}</div>
                                                </td>
                                                <td className="px-5 py-3.5 text-right">
                                                    {!comm.is_read && (
                                                        <span className="inline-block w-2 h-2 bg-blue-500 rounded-full" />
                                                    )}
                                                </td>
                                            </tr>
                                        )
                                    })}
                                </tbody>
                            </table>
                        </div>

                        {/* モバイル: カード表示 */}
                        <div className="md:hidden divide-y divide-slate-100">
                            {communications.map((comm) => {
                                const isLine = comm.channel_type === "LINE"
                                const isOutbound = comm.direction === "OUTBOUND"
                                const contactName = comm.contacts?.name
                                const displayEmail = isOutbound ? comm.recipient_email : comm.sender_email

                                return (
                                    <div
                                        key={comm.id}
                                        onClick={() => {
                                            setSelectedComm(comm)
                                            handleMarkRead(comm)
                                        }}
                                        className={`px-4 py-3 active:bg-slate-50 cursor-pointer ${
                                            !comm.is_read ? "bg-blue-50/30" : ""
                                        }`}
                                    >
                                        <div className="flex items-start gap-3">
                                            <div className={`mt-0.5 h-8 w-8 shrink-0 rounded-full flex items-center justify-center border ${
                                                isLine
                                                    ? "bg-emerald-50 border-emerald-100 text-emerald-600"
                                                    : "bg-blue-50 border-blue-100 text-blue-600"
                                            }`}>
                                                {isLine ? <MessageCircle className="h-4 w-4" /> : <Mail className="h-4 w-4" />}
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <div className="flex items-center justify-between gap-2">
                                                    <span className={`text-sm line-clamp-1 ${!comm.is_read ? "font-bold" : "font-medium"} text-slate-900`}>
                                                        {contactName || displayEmail || "-"}
                                                    </span>
                                                    <span className="text-xs text-slate-500 shrink-0">{formatDate(comm.sent_at)}</span>
                                                </div>
                                                <div className={`text-xs mt-0.5 line-clamp-1 ${!comm.is_read ? "font-semibold text-slate-800" : "text-slate-700"}`}>
                                                    {comm.subject || "(件名なし)"}
                                                </div>
                                                <div className="text-xs text-slate-500 mt-0.5 line-clamp-1">
                                                    {comm.content?.substring(0, 80) || ""}
                                                </div>
                                            </div>
                                            {!comm.is_read && (
                                                <span className="mt-2 inline-block w-2 h-2 bg-blue-500 rounded-full shrink-0" />
                                            )}
                                        </div>
                                    </div>
                                )
                            })}
                        </div>

                        {/* ページネーション */}
                        <div className="px-4 md:px-6 py-3 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between">
                            <p className="text-xs md:text-sm text-slate-500">
                                全{total}件中 {total > 0 ? (currentPage - 1) * limit + 1 : 0}-{Math.min(currentPage * limit, total)}件
                            </p>
                            <div className="flex items-center gap-1">
                                <button
                                    disabled={currentPage === 1}
                                    onClick={() => setCurrentPage(p => p - 1)}
                                    className="p-1.5 rounded-md border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 disabled:opacity-40"
                                >
                                    <ChevronLeft className="w-4 h-4" />
                                </button>
                                <span className="px-2 text-sm text-slate-700">{currentPage} / {totalPages}</span>
                                <button
                                    disabled={currentPage >= totalPages}
                                    onClick={() => setCurrentPage(p => p + 1)}
                                    className="p-1.5 rounded-md border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 disabled:opacity-40"
                                >
                                    <ChevronRight className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                    </>
                )}
            </div>

            {/* メール詳細スライドオーバー */}
            {selectedComm && (
                <div className="fixed inset-0 z-50 flex justify-end">
                    <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" onClick={() => setSelectedComm(null)} />
                    <div className="relative w-full max-w-xl bg-white shadow-2xl overflow-y-auto animate-slide-in-right">
                        <div className="sticky top-0 bg-white border-b border-slate-200 px-4 md:px-6 py-4 flex items-center justify-between z-10">
                            <div className="flex items-center gap-2">
                                {selectedComm.channel_type === "LINE"
                                    ? <MessageCircle className="w-5 h-5 text-emerald-600" />
                                    : <Mail className="w-5 h-5 text-blue-600" />
                                }
                                <span className="text-sm font-medium text-slate-500">
                                    {selectedComm.channel_type === "LINE" ? "LINEメッセージ" : "メール"}
                                </span>
                            </div>
                            <button
                                onClick={() => setSelectedComm(null)}
                                className="p-1.5 rounded-md hover:bg-slate-100 text-slate-400 hover:text-slate-600"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="p-4 md:p-6 space-y-4">
                            <h2 className="text-lg font-bold text-slate-900">
                                {selectedComm.subject || "(件名なし)"}
                            </h2>
                            <div className="flex items-start justify-between gap-3">
                                <div>
                                    <div className="flex items-center gap-2">
                                        <span className={`px-2 py-0.5 rounded-md text-xs font-medium ${
                                            selectedComm.direction === "OUTBOUND"
                                                ? "bg-indigo-50 text-indigo-700"
                                                : "bg-rose-50 text-rose-700"
                                        }`}>
                                            {selectedComm.direction === "OUTBOUND" ? "送信" : "受信"}
                                        </span>
                                        {selectedComm.contacts && (
                                            <a href={`/contacts/${selectedComm.contacts.id}`} className="text-sm font-medium text-blue-600 hover:underline flex items-center gap-1">
                                                {selectedComm.contacts.name}
                                                <Link2 className="w-3 h-3" />
                                            </a>
                                        )}
                                    </div>
                                    <div className="text-xs text-slate-500 mt-1">
                                        {selectedComm.direction === "OUTBOUND" ? "宛先" : "送信元"}: {selectedComm.direction === "OUTBOUND" ? selectedComm.recipient_email : selectedComm.sender_email}
                                    </div>
                                    {selectedComm.companies && (
                                        <div className="text-xs text-slate-400 mt-0.5">
                                            {selectedComm.companies.name}
                                        </div>
                                    )}
                                </div>
                                <div className="text-xs text-slate-500 shrink-0">
                                    <Calendar className="w-3.5 h-3.5 inline mr-1" />
                                    {new Date(selectedComm.sent_at).toLocaleString("ja-JP")}
                                </div>
                            </div>

                            {/* 添付ファイル */}
                            {selectedComm.attachments && selectedComm.attachments.length > 0 && (
                                <div className="bg-slate-50 rounded-lg p-3 space-y-2">
                                    <div className="text-xs font-medium text-slate-600 flex items-center gap-1">
                                        <Paperclip className="w-3.5 h-3.5" />
                                        添付ファイル ({selectedComm.attachments.length})
                                    </div>
                                    {selectedComm.attachments.map((att, i) => (
                                        <div key={i} className="text-xs text-slate-700 pl-5">
                                            {att.filename} ({Math.round(att.size / 1024)}KB)
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* 本文 */}
                            <div className="border-t border-slate-100 pt-4">
                                <div
                                    className="prose prose-sm prose-slate max-w-none text-sm text-slate-700 whitespace-pre-wrap break-words"
                                    dangerouslySetInnerHTML={{ __html: selectedComm.content || "" }}
                                />
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* メール作成モーダル */}
            {showCompose && (
                <ComposeEmailModal
                    contacts={contacts}
                    gmailConnected={gmailConnected}
                    onClose={() => setShowCompose(false)}
                    onSent={() => {
                        setShowCompose(false)
                        fetchCommunications()
                    }}
                />
            )}

            <style jsx>{`
                @keyframes slide-in-right {
                    from { transform: translateX(100%); }
                    to { transform: translateX(0); }
                }
                .animate-slide-in-right {
                    animation: slide-in-right 0.2s ease-out;
                }
            `}</style>
        </div>
    )
}

// メール作成モーダルコンポーネント
function ComposeEmailModal({
    contacts,
    gmailConnected,
    onClose,
    onSent,
}: {
    contacts: Contact[]
    gmailConnected: boolean
    onClose: () => void
    onSent: () => void
}) {
    const [to, setTo] = useState("")
    const [subject, setSubject] = useState("")
    const [body, setBody] = useState("")
    const [sending, setSending] = useState(false)
    const [error, setError] = useState("")
    const [contactSearch, setContactSearch] = useState("")
    const [showContactDropdown, setShowContactDropdown] = useState(false)

    const filteredContacts = contacts.filter(c =>
        c.email && (
            c.name.toLowerCase().includes(contactSearch.toLowerCase()) ||
            (c.email || "").toLowerCase().includes(contactSearch.toLowerCase())
        )
    )

    const handleSend = async () => {
        if (!to || !subject || !body) {
            setError("宛先・件名・本文は必須です")
            return
        }
        if (!gmailConnected) {
            setError("Gmailが接続されていません")
            return
        }

        setSending(true)
        setError("")
        try {
            const res = await fetch("/api/gmail/send", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ to, subject, content: body }),
            })
            const data = await res.json()
            if (data.success) {
                onSent()
            } else {
                setError(data.error || "送信に失敗しました")
            }
        } catch {
            setError("送信に失敗しました")
        } finally {
            setSending(false)
        }
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
            <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
                    <h3 className="text-base font-semibold text-slate-900 flex items-center gap-2">
                        <Send className="w-4 h-4 text-blue-600" />
                        新規メール
                    </h3>
                    <button onClick={onClose} className="p-1 rounded-md hover:bg-slate-100 text-slate-400">
                        <X className="w-5 h-5" />
                    </button>
                </div>
                <div className="p-5 space-y-4">
                    {!gmailConnected && (
                        <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
                            <AlertCircle className="w-4 h-4 shrink-0" />
                            <span>Gmailが未接続です。<a href="/api/gmail/auth" className="underline font-medium">接続する</a></span>
                        </div>
                    )}
                    <div className="relative">
                        <label className="block text-xs font-medium text-slate-600 mb-1">宛先</label>
                        <input
                            type="email"
                            value={to}
                            onChange={(e) => {
                                setTo(e.target.value)
                                setContactSearch(e.target.value)
                                setShowContactDropdown(true)
                            }}
                            onFocus={() => setShowContactDropdown(true)}
                            onBlur={() => setTimeout(() => setShowContactDropdown(false), 200)}
                            placeholder="メールアドレスまたは担当者名で検索..."
                            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                        />
                        {showContactDropdown && filteredContacts.length > 0 && (
                            <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-40 overflow-y-auto z-10">
                                {filteredContacts.slice(0, 8).map((c) => (
                                    <button
                                        key={c.id}
                                        onClick={() => {
                                            setTo(c.email || "")
                                            setShowContactDropdown(false)
                                        }}
                                        className="w-full px-3 py-2 text-left hover:bg-slate-50 text-sm"
                                    >
                                        <div className="font-medium text-slate-900">{c.name}</div>
                                        <div className="text-xs text-slate-500">{c.email}</div>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">件名</label>
                        <input
                            type="text"
                            value={subject}
                            onChange={(e) => setSubject(e.target.value)}
                            placeholder="件名を入力..."
                            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">本文</label>
                        <textarea
                            value={body}
                            onChange={(e) => setBody(e.target.value)}
                            placeholder="メール本文を入力..."
                            rows={8}
                            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 resize-none"
                        />
                    </div>
                    {error && (
                        <div className="text-xs text-rose-600 flex items-center gap-1">
                            <AlertCircle className="w-3.5 h-3.5" />
                            {error}
                        </div>
                    )}
                </div>
                <div className="px-5 py-4 border-t border-slate-200 flex items-center justify-end gap-3">
                    <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 rounded-lg">
                        キャンセル
                    </button>
                    <button
                        onClick={handleSend}
                        disabled={sending || !gmailConnected}
                        className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
                    >
                        {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                        {sending ? "送信中..." : "送信"}
                    </button>
                </div>
            </div>
        </div>
    )
}
