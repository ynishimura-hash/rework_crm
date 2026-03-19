"use server"

import { createAdminClient } from "@/lib/supabase/admin"
import { revalidatePath } from "next/cache"

// ==========================================
// コミュニケーション (Communications) - Server Actions
// ==========================================

export interface CommunicationFilters {
    channelType?: "EMAIL" | "LINE" | null
    direction?: "INBOUND" | "OUTBOUND" | null
    isRead?: boolean | null
    contactId?: string | null
    companyId?: string | null
    search?: string | null
    page?: number
    limit?: number
}

export interface Communication {
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
    attachments: unknown[]
    created_at: string
    contacts?: {
        id: string
        name: string
        email: string | null
        company_id: string | null
    } | null
    companies?: {
        id: string
        name: string
    } | null
}

// コミュニケーション一覧を取得
export async function getCommunications(filters: CommunicationFilters = {}) {
    const supabase = createAdminClient()
    const { channelType, direction, isRead, contactId, companyId, search, page = 1, limit = 20 } = filters

    let query = supabase
        .from("communications")
        .select(`
            *,
            contacts:contact_id (id, name, email, company_id),
            companies:company_id (id, name)
        `, { count: "exact" })
        .order("sent_at", { ascending: false })

    if (channelType) query = query.eq("channel_type", channelType)
    if (direction) query = query.eq("direction", direction)
    if (isRead !== null && isRead !== undefined) query = query.eq("is_read", isRead)
    if (contactId) query = query.eq("contact_id", contactId)
    if (companyId) query = query.eq("company_id", companyId)
    if (search) {
        query = query.or(`subject.ilike.%${search}%,content.ilike.%${search}%,sender_email.ilike.%${search}%`)
    }

    // ページネーション
    const from = (page - 1) * limit
    query = query.range(from, from + limit - 1)

    const { data, error, count } = await query

    if (error) {
        console.error("Failed to fetch communications:", error)
        return { data: [], total: 0 }
    }

    return { data: (data || []) as Communication[], total: count || 0 }
}

// 単一コミュニケーション取得
export async function getCommunicationById(id: string) {
    const supabase = createAdminClient()
    const { data, error } = await supabase
        .from("communications")
        .select(`
            *,
            contacts:contact_id (id, name, email, company_id),
            companies:company_id (id, name)
        `)
        .eq("id", id)
        .single()

    if (error) {
        console.error("Failed to fetch communication:", error)
        return null
    }
    return data as Communication
}

// 既読にする
export async function markCommunicationAsRead(id: string) {
    const supabase = createAdminClient()
    const { error } = await supabase
        .from("communications")
        .update({ is_read: true })
        .eq("id", id)

    if (error) {
        console.error("Failed to mark as read:", error)
        throw error
    }
    revalidatePath("/communications")
}

// 担当者のコミュニケーション履歴を取得
export async function getCommunicationsByContactId(contactId: string) {
    return getCommunications({ contactId, limit: 50 })
}

// 企業のコミュニケーション履歴を取得
export async function getCommunicationsByCompanyId(companyId: string) {
    return getCommunications({ companyId, limit: 50 })
}

// 未読数を取得
export async function getUnreadCount(channelType?: "EMAIL" | "LINE") {
    const supabase = createAdminClient()
    let query = supabase
        .from("communications")
        .select("id", { count: "exact", head: true })
        .eq("is_read", false)

    if (channelType) query = query.eq("channel_type", channelType)

    const { count } = await query
    return count || 0
}

// Gmail接続状態を確認
export async function getGmailConnectionStatus() {
    const supabase = createAdminClient()
    const { data } = await supabase
        .from("gmail_tokens")
        .select("gmail_address, updated_at")
        .eq("user_id", "default")
        .single()

    return data ? { connected: true, email: data.gmail_address, lastSync: data.updated_at } : { connected: false }
}

// LINE Works接続状態を確認
export async function getLineWorksConnectionStatus() {
    const supabase = createAdminClient()
    const { data } = await supabase
        .from("lineworks_tokens")
        .select("bot_id, domain_id, updated_at")
        .eq("user_id", "default")
        .single()

    return data ? { connected: true, botId: data.bot_id, lastSync: data.updated_at } : { connected: false }
}

// 未紐付けメールを自動紐付け
export async function autoLinkUnmatchedEmails() {
    const supabase = createAdminClient()

    // contact_id が null のメールを取得
    const { data: unlinked } = await supabase
        .from("communications")
        .select("id, sender_email, recipient_email")
        .is("contact_id", null)
        .not("sender_email", "is", null)

    if (!unlinked || unlinked.length === 0) return { linked: 0 }

    let linkedCount = 0
    for (const comm of unlinked) {
        // sender_email と recipient_email の両方で検索
        const emails = [comm.sender_email, comm.recipient_email].filter(Boolean)
        for (const email of emails) {
            const { data: contact } = await supabase
                .from("contacts")
                .select("id, company_id")
                .eq("email", email)
                .single()

            if (contact) {
                await supabase
                    .from("communications")
                    .update({
                        contact_id: contact.id,
                        company_id: contact.company_id,
                    })
                    .eq("id", comm.id)
                linkedCount++
                break
            }
        }
    }

    revalidatePath("/communications")
    return { linked: linkedCount }
}
