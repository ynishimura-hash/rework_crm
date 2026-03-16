"use client"

import { useState } from "react"
import { MessageSquare, Search, Plus, Filter, Download, MoreVertical, Mail, MessageCircle, Calendar } from "lucide-react"

export default function CommunicationsPage() {
    const [currentPage, setCurrentPage] = useState(1)

    // TODO: Supabase communications テーブルから取得に切り替え
    const allCommunications: any[] = []

    // Excelの日付・時刻シリアル値をJS Dateに変換する簡易関数
    const excelDateToJSDate = (serial: number) => {
        if (!serial) return "日時不明";
        const utc_days = Math.floor(serial - 25569);
        const utc_value = utc_days * 86400;
        const date_info = new Date(utc_value * 1000);
        return `${date_info.getFullYear()}/${String(date_info.getMonth() + 1).padStart(2, '0')}/${String(date_info.getDate()).padStart(2, '0')} ${String(date_info.getHours()).padStart(2, '0')}:${String(date_info.getMinutes()).padStart(2, '0')}`;
    }

    // ページネーション設定
    const itemsPerPage = 20
    const totalPages = Math.ceil(allCommunications.length / itemsPerPage) || 1
    const startIndex = (currentPage - 1) * itemsPerPage
    const currentComms = allCommunications.slice(startIndex, startIndex + itemsPerPage)

    return (
        <div className="space-y-6">
            {/* 固定ヘッダー部分 */}
            <div className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur-sm -mx-4 md:-mx-8 px-4 md:px-8 pb-4 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                            <MessageSquare className="w-6 h-6 text-blue-600" />
                            メッセージ・LINE
                        </h1>
                        <p className="text-sm text-slate-500 mt-1">
                            メールやチャットでの全てのコミュニケーション履歴（全{allCommunications.length}件）を集約しています。
                        </p>
                    </div>
                    <div className="flex items-center gap-3">
                        <button className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors shadow-sm">
                            <Plus className="w-4 h-4" />
                            メッセージ送信
                        </button>
                    </div>
                </div>

                <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex flex-col sm:flex-row gap-4 justify-between items-center">
                    <div className="relative flex-1 w-full max-w-md">
                        <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                        <input
                            type="text"
                            placeholder="件名、本文、送信者で検索..."
                            className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all placeholder:text-slate-400"
                        />
                    </div>
                    <div className="flex items-center gap-3 w-full sm:w-auto">
                        <button className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-50 transition-colors">
                            <Filter className="w-4 h-4" />
                            チャネル絞り込み
                        </button>
                        <button className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-50 transition-colors">
                            <Download className="w-4 h-4" />
                            DL
                        </button>
                    </div>
                </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-slate-200">
                        <thead className="bg-slate-50/50">
                            <tr>
                                <th scope="col" className="px-6 py-3.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider w-1/2">
                                    件名 / 本文プレビュー
                                </th>
                                <th scope="col" className="px-6 py-3.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                                    日時 / チャネル
                                </th>
                                <th scope="col" className="px-6 py-3.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider hidden md:table-cell">
                                    送信者 / 宛先
                                </th>
                                <th scope="col" className="relative px-6 py-3.5">
                                    <span className="sr-only">アクション</span>
                                </th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 bg-white">
                            {currentComms.map((comm, idx) => {
                                const isLine = comm["チャネル"] === "LINE";
                                const isSent = comm["送受信"] === "送信";

                                return (
                                    <tr
                                        key={idx}
                                        onClick={() => {}}
                                        className="hover:bg-slate-50/80 transition-colors cursor-pointer group"
                                    >
                                        <td className="px-6 py-4">
                                            <div className="flex items-start">
                                                <div className={`mt-1 h-8 w-8 shrink-0 rounded-full flex items-center justify-center border ${isLine ? 'bg-emerald-50 border-emerald-100 text-emerald-600' : 'bg-blue-50 border-blue-100 text-blue-600'
                                                    }`}>
                                                    {isLine ? <MessageCircle className="h-4 w-4" /> : <Mail className="h-4 w-4" />}
                                                </div>
                                                <div className="ml-3 min-w-0 flex-1">
                                                    <div className="text-sm font-semibold text-slate-900 line-clamp-1">
                                                        {comm["件名"] || '（件名なし）'}
                                                    </div>
                                                    <div className="text-xs text-slate-500 mt-1 line-clamp-2">
                                                        {comm["本文"] || '本文プレビューなし'}
                                                    </div>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div className="flex flex-col gap-1.5">
                                                <div className="flex items-center gap-1.5 text-sm font-medium text-slate-700">
                                                    <Calendar className="w-4 h-4 text-slate-400" />
                                                    {typeof comm["送受信日"] === 'number' ? excelDateToJSDate(comm["送受信日"]) : (comm["送受信日"] || '-')}
                                                </div>
                                                <div className="flex items-center gap-1.5 text-xs">
                                                    <span className={`px-2 py-0.5 rounded-sm font-medium ${isSent ? 'bg-indigo-50 text-indigo-700' : 'bg-rose-50 text-rose-700'}`}>
                                                        {comm["送受信"] || '受信'}
                                                    </span>
                                                    <span className="text-slate-500">{isLine ? 'LINE' : 'Email'}</span>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 hidden md:table-cell">
                                            <div className="text-sm font-medium text-slate-900 truncate max-w-[200px]" title={comm["送受信者名"]}>
                                                {comm["送受信者名"] || '-'}
                                            </div>
                                            <div className="text-xs text-slate-500 truncate max-w-[200px]" title={comm["メールアドレス"]}>
                                                {comm["メールアドレス"] || '-'}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                            <button className="text-slate-400 hover:text-slate-600 p-1 rounded-md hover:bg-slate-100 transition-colors">
                                                <MoreVertical className="w-5 h-5" />
                                            </button>
                                        </td>
                                    </tr>
                                )
                            })}
                        </tbody>
                    </table>
                </div>
                <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between">
                    <p className="text-sm text-slate-500">全{allCommunications.length}件中 {allCommunications.length > 0 ? startIndex + 1 : 0}-{Math.min(startIndex + itemsPerPage, allCommunications.length)}件を表示</p>
                    <div className="flex gap-1">
                        <button
                            disabled={currentPage === 1}
                            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                            className="px-3 py-1 text-sm border border-slate-200 rounded-md bg-white text-slate-500 hover:bg-slate-50 disabled:opacity-50"
                        >前へ</button>
                        <button className="px-3 py-1 text-sm border border-slate-200 rounded-md bg-white text-blue-600 font-medium border-blue-200 min-w-[2rem]">
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
        </div>
    )
}
