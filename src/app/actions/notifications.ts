"use server"

import { createAdminClient } from "@/lib/supabase/admin"

// 通知一覧を取得
export async function getNotifications(limit = 20) {
    const supabase = createAdminClient()

    const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit)

    if (error) {
        console.error("Failed to fetch notifications:", error)
        return []
    }
    return data || []
}

// 未読通知数を取得
export async function getUnreadCount(): Promise<number> {
    const supabase = createAdminClient()

    const { count, error } = await supabase
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('is_read', false)

    if (error) {
        console.error("Failed to fetch unread count:", error)
        return 0
    }
    return count || 0
}

// 通知を既読にする
export async function markAsRead(id: string) {
    const supabase = createAdminClient()

    await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('id', id)
}

// 全て既読にする
export async function markAllAsRead() {
    const supabase = createAdminClient()

    await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('is_read', false)
}
