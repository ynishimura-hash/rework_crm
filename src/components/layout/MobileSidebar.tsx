"use client"

import { useState } from "react"
import { Menu, X } from "lucide-react"
import Sidebar from "./Sidebar"

interface MobileSidebarProps {
    userName?: string
    userEmail?: string
}

export default function MobileSidebar({ userName, userEmail }: MobileSidebarProps) {
    const [isOpen, setIsOpen] = useState(false)

    return (
        <>
            {/* ハンバーガーボタン（md以下で表示） */}
            <button
                className="md:hidden p-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                onClick={() => setIsOpen(true)}
                aria-label="メニューを開く"
            >
                <Menu className="w-6 h-6" />
            </button>

            {/* オーバーレイ + スライドインサイドバー */}
            {isOpen && (
                <div className="fixed inset-0 z-50 md:hidden">
                    {/* オーバーレイ背景 */}
                    <div
                        className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm"
                        onClick={() => setIsOpen(false)}
                    />
                    {/* サイドバー本体 */}
                    <div className="fixed inset-y-0 left-0 w-64 bg-white shadow-xl z-50 animate-slide-in">
                        <div className="absolute top-4 right-4 z-10">
                            <button
                                onClick={() => setIsOpen(false)}
                                className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                                aria-label="メニューを閉じる"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <Sidebar userName={userName} userEmail={userEmail} />
                    </div>
                </div>
            )}
        </>
    )
}
