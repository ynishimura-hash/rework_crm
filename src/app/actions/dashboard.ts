"use server"

import { createAdminClient } from "@/lib/supabase/admin"

// ==========================================
// ダッシュボード統計 - Supabase集計
// ==========================================

export async function getDashboardStats() {
    const supabase = createAdminClient()

    // 並列クエリでKPIを取得
    const [
        companiesResult,
        dealsResult,
        activeDealsResult,
        recentDealsResult,
    ] = await Promise.all([
        supabase.from('companies').select('*', { count: 'exact', head: true }),
        supabase.from('deals').select('*', { count: 'exact', head: true }),
        supabase.from('deals')
            .select('*, companies:company_id(id, name), contacts:contact_id(id, name)')
            .not('status', 'in', '("失注","入金確認完了")')
            .order('created_at', { ascending: false })
            .limit(10),
        supabase.from('deals')
            .select('*, companies:company_id(id, name)')
            .order('created_at', { ascending: false })
            .limit(5),
    ])

    // 進行中の商談数
    const activeDeals = activeDealsResult.data || []

    // 最近の活動をdealsから代用（activitiesテーブルにデータがない場合のフォールバック）
    const recentActivities = (recentDealsResult.data || []).map((deal: any) => ({
        id: deal.id,
        type: 'deal',
        title: deal.title,
        company: deal.companies?.name || '不明',
        time: deal.created_at,
        status: deal.status,
    }))

    return {
        stats: {
            activeDealsCount: activeDeals.length,
            totalDealsCount: dealsResult.count || 0,
            activeCompanies: companiesResult.count || 0,
            newLeads: 0,
        },
        activeDeals: activeDeals.map((deal: any) => ({
            id: deal.id,
            title: deal.title,
            company: deal.companies?.name || '不明',
            contact: deal.contacts?.name || '',
            amount: deal.estimated_amount || 0,
            status: deal.status,
            closeDate: deal.close_date,
        })),
        recentActivities,
    }
}
