"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import {
    BarChart3,
    Building2,
    Users,
    Briefcase,
    Settings,
    LayoutDashboard,
    Calendar,
    Layers,
    MessageSquare,
    Link as LinkIcon,
    CreditCard,
    ClipboardList,
    LogOut
} from "lucide-react"

import { cn } from "@/lib/utils"
import { createClient } from "@/lib/supabase/client"

const navigation = [
    { name: 'ダッシュボード', href: '/', icon: LayoutDashboard },
    { name: '企業・顧客', href: '/companies', icon: Building2 },
    { name: '担当者リスト', href: '/contacts', icon: Users },
    { name: '商談・案件', href: '/deals', icon: Briefcase },
    { name: '活動ログ', href: '/activities', icon: ClipboardList },
    { name: 'カレンダー', href: '/calendar', icon: Calendar },
    { name: '予約リンク', href: '/event-types', icon: LinkIcon },
    { name: 'メッセージ', href: '/communications', icon: MessageSquare },
    { name: '提供サービス', href: '/services', icon: Layers },
    { name: 'レポート・売上', href: '/reports', icon: BarChart3 },
    { name: 'freee連携', href: '/api/freee/auth', icon: LinkIcon },
    { name: '入金記録', href: '/freee/payments', icon: CreditCard },
    { name: '設定', href: '/settings', icon: Settings },
]

interface SidebarProps {
    userName?: string
    userEmail?: string
}

export default function Sidebar({ userName, userEmail }: SidebarProps) {
    const pathname = usePathname()
    const router = useRouter()

    const handleLogout = async () => {
        const supabase = createClient()
        await supabase.auth.signOut()
        router.push('/auth/login')
    }

    // 表示名: ユーザー名があればそれを、なければメールのローカル部分を使用
    const displayName = userName || userEmail?.split('@')[0] || '---'
    const displayEmail = userEmail || ''
    const initials = displayName.slice(0, 2).toUpperCase()

    return (
        <div className="flex w-64 flex-col bg-white h-screen fixed top-0 overflow-hidden">
            <div className="flex h-16 shrink-0 items-center px-6 border-b border-slate-100">
                <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-lg bg-blue-600 flex items-center justify-center shadow-sm">
                        <span className="text-white font-bold font-mono text-lg">R</span>
                    </div>
                    <span className="text-slate-800 text-lg font-bold tracking-tight">
                        Rework CRM
                    </span>
                </div>
            </div>
            <div className="flex flex-1 flex-col overflow-y-auto mt-2">
                <nav className="flex-1 space-y-0.5 px-3">
                    {navigation.map((item) => {
                        const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`)
                        return (
                            <Link
                                key={item.name}
                                href={item.href}
                                className={cn(
                                    isActive
                                        ? 'bg-blue-50 text-blue-700'
                                        : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900',
                                    'group flex items-center rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200'
                                )}
                            >
                                <item.icon
                                    className={cn(
                                        isActive ? 'text-blue-600' : 'text-slate-400 group-hover:text-slate-600',
                                        'mr-3 h-4 w-4 shrink-0 transition-colors'
                                    )}
                                    aria-hidden="true"
                                />
                                {item.name}
                            </Link>
                        )
                    })}
                </nav>
            </div>

            {/* フッター部分のアカウント表示 + ログアウト */}
            <div className="p-4 border-t border-slate-100 mt-auto">
                <div className="flex items-center gap-3 px-2 py-2 rounded-lg">
                    <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                        <span className="text-xs font-bold text-blue-700">{initials}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-700 truncate">{displayName}</p>
                        <p className="text-xs text-slate-500 truncate">{displayEmail}</p>
                    </div>
                    <button
                        onClick={handleLogout}
                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                        title="ログアウト"
                    >
                        <LogOut className="h-4 w-4" />
                    </button>
                </div>
            </div>
        </div>
    )
}
