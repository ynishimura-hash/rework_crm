import {
  Building2,
  Users,
  Briefcase,
  ArrowUpRight,
  MoreHorizontal,
  Calendar,
  FileText
} from "lucide-react"

import { getDashboardStats } from "@/app/actions/dashboard"

export default async function Home() {
  const { stats: dbStats, activeDeals, recentActivities } = await getDashboardStats()

  const stats = [
    { name: '進行中の商談', value: `${dbStats.activeDealsCount}件`, icon: Briefcase, color: 'text-blue-600', bg: 'bg-blue-100' },
    { name: '総商談数', value: `${dbStats.totalDealsCount}件`, icon: ArrowUpRight, color: 'text-emerald-600', bg: 'bg-emerald-100' },
    { name: '新規リード (今週)', value: `${dbStats.newLeads}社`, icon: Building2, color: 'text-rose-600', bg: 'bg-rose-100' },
    { name: '登録企業数', value: `${dbStats.activeCompanies}社`, icon: Users, color: 'text-indigo-600', bg: 'bg-indigo-100' },
  ]
  return (
    <div className="space-y-8 pb-8">
      {/* ページヘッダー */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">
          ダッシュボード
        </h1>
        <p className="text-slate-500 mt-1">今日のサマリと重要なアクションを確認できます。</p>
      </div>

      {/* KPIカード */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <div
            key={stat.name}
            className="relative overflow-hidden rounded-2xl bg-white p-6 shadow-sm border border-slate-100 hover:shadow-md transition-shadow group"
          >
            <div className="flex items-center gap-4">
              <div className={`p-3 rounded-xl ${stat.bg} ${stat.color} group-hover:scale-110 transition-transform`}>
                <stat.icon className="h-6 w-6" aria-hidden="true" />
              </div>
              <div>
                <p className="text-sm font-medium text-slate-500">{stat.name}</p>
                <p className="text-2xl font-semibold text-slate-900">{stat.value}</p>
              </div>
            </div>
            <div className="absolute top-0 right-0 -mt-4 -mr-4 w-24 h-24 bg-gradient-to-br from-slate-50 to-slate-100 rounded-full blur-xl opacity-50 pointer-events-none"></div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        {/* 最近の活動 */}
        <div className="rounded-2xl bg-white shadow-sm border border-slate-100 overflow-hidden flex flex-col">
          <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
            <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-blue-500"></span>
              最近のアクティビティ
            </h2>
          </div>
          <div className="flex-1 p-6">
            {recentActivities.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-8">アクティビティはまだありません</p>
            ) : (
              <div className="flow-root">
                <ul role="list" className="-mb-8">
                  {recentActivities.map((activity: any, activityIdx: number) => (
                    <li key={activity.id}>
                      <div className="relative pb-8">
                        {activityIdx !== recentActivities.length - 1 ? (
                          <span className="absolute left-5 top-5 -ml-px h-full w-0.5 bg-slate-100" aria-hidden="true" />
                        ) : null}
                        <div className="relative flex items-start space-x-4">
                          <div className="relative">
                            <div className="flex h-10 w-10 items-center justify-center rounded-full ring-8 ring-white bg-blue-50 text-blue-600">
                              <FileText className="h-5 w-5" />
                            </div>
                          </div>
                          <div className="min-w-0 flex-1 py-1.5 space-y-1">
                            <div className="text-sm text-slate-500 flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-2">
                              <span className="font-semibold text-slate-900 break-words">{activity.title}</span>
                              <span className="inline-flex max-w-full items-center bg-slate-100 px-2 py-0.5 rounded-full text-xs text-slate-600 truncate">{activity.company}</span>
                            </div>
                            <div className="text-xs text-slate-400">
                              {activity.status} • {new Date(activity.time).toLocaleDateString('ja-JP')}
                            </div>
                          </div>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>

        {/* 進行中の商談 */}
        <div className="rounded-2xl bg-white shadow-sm border border-slate-100 overflow-hidden flex flex-col">
          <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
            <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              進行中の重要商談
            </h2>
            <button className="p-1 text-slate-400 hover:text-slate-600"><MoreHorizontal className="h-5 w-5" /></button>
          </div>
          <div className="flex-1 p-0">
            {activeDeals.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-8">進行中の商談はありません</p>
            ) : (
              <ul role="list" className="divide-y divide-slate-100">
                {activeDeals.map((deal: any) => (
                  <li key={deal.id} className="p-6 hover:bg-slate-50 transition-colors cursor-pointer group">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-sm font-medium text-indigo-600 group-hover:text-indigo-700">{deal.company}</p>
                      <p className="text-sm text-slate-500 bg-slate-100 px-2.5 py-0.5 rounded-full">{deal.status}</p>
                    </div>
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mt-2">
                      <div className="min-w-0">
                        <p className="text-base font-semibold text-slate-900 break-words line-clamp-2">{deal.title}</p>
                        <p className="text-xs text-slate-500 mt-1 flex items-center gap-1">
                          <Calendar className="w-3 h-3 shrink-0" />
                          着地予定: {deal.closeDate || '未定'}
                        </p>
                      </div>
                      <div className="text-left sm:text-right shrink-0">
                        <p className="text-lg font-bold text-slate-900">
                          {deal.amount ? `¥${deal.amount.toLocaleString()}` : '-'}
                        </p>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
