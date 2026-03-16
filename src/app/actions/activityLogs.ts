"use server"

import { createAdminClient } from "@/lib/supabase/admin"

// アクションタイプの定義
export type ActionType =
    | 'deal_created'
    | 'deal_updated'
    | 'company_created'
    | 'invoice_created'
    | 'quotation_created'
    | 'payment_confirmed'
    | 'freee_synced'
    | 'freee_unlinked'
    | 'freee_import'
    | 'freee_auto_linked'

// 活動ログの型
export interface ActivityLog {
    id: string
    action_type: ActionType
    description: string
    related_deal_id: string | null
    related_company_id: string | null
    metadata: Record<string, any>
    created_at: string
}

// ログを記録する
export async function logActivity(
    action_type: ActionType,
    description: string,
    options?: {
        related_deal_id?: string | null
        related_company_id?: string | null
        metadata?: Record<string, any>
    }
) {
    const supabase = createAdminClient()
    const { data, error } = await supabase
        .from('activity_logs')
        .insert({
            action_type,
            description,
            related_deal_id: options?.related_deal_id || null,
            related_company_id: options?.related_company_id || null,
            metadata: options?.metadata || {},
        })
        .select()
        .single()

    if (error) {
        console.error("Failed to log activity:", error)
        // ログ記録の失敗でメイン処理を止めない
        return null
    }
    return data
}

// 活動ログを取得する（フィルタ・ソート・ページネーション対応）
export async function getActivityLogs(options?: {
    action_type?: string
    limit?: number
    offset?: number
}) {
    const supabase = createAdminClient()
    let query = supabase
        .from('activity_logs')
        .select('*, deals:related_deal_id(id, title), companies:related_company_id(id, name)', { count: 'exact' })
        .order('created_at', { ascending: false })

    if (options?.action_type && options.action_type !== 'all') {
        query = query.eq('action_type', options.action_type)
    }

    if (options?.limit) {
        query = query.limit(options.limit)
    } else {
        query = query.limit(50)
    }

    if (options?.offset) {
        query = query.range(options.offset, options.offset + (options.limit || 50) - 1)
    }

    const { data, error, count } = await query

    if (error) {
        console.error("Failed to get activity logs:", error)
        return { logs: [], count: 0 }
    }

    return { logs: data || [], count: count || 0 }
}
