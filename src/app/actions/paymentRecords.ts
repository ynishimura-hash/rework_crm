"use server"

import { revalidatePath } from "next/cache"
import { createAdminClient } from "@/lib/supabase/admin"

export async function getPaymentRecordsByDealId(dealId: string) {
    const supabase = createAdminClient()
    const { data, error } = await supabase
        .from('payment_records')
        .select('*')
        .eq('deal_id', dealId)
        .order('payment_date', { ascending: false })

    if (error) {
        console.error("Failed to fetch payment records:", error)
        return []
    }
    return data || []
}

export async function createPaymentRecord(record: {
    deal_id: string
    company_id?: string | null
    amount: number
    payment_date?: string | null
    payment_method?: string | null
    bank_name?: string | null
    description?: string | null
    freee_txn_id?: string | null
    memo?: string | null
}) {
    const supabase = createAdminClient()

    // freee_txn_idが指定されている場合、重複チェック
    if (record.freee_txn_id) {
        const { data: existing } = await supabase
            .from('payment_records')
            .select('id')
            .eq('freee_txn_id', record.freee_txn_id)
            .maybeSingle()
        if (existing) return existing
    }

    const { data, error } = await supabase
        .from('payment_records')
        .insert(record)
        .select()
        .single()

    if (error) {
        console.error("Failed to create payment record:", error)
        throw error
    }

    revalidatePath(`/deals/${record.deal_id}`)
    return data
}

export async function deletePaymentRecord(id: string, dealId: string) {
    const supabase = createAdminClient()
    const { error } = await supabase.from('payment_records').delete().eq('id', id)
    if (error) {
        console.error("Failed to delete payment record:", error)
        throw error
    }
    revalidatePath(`/deals/${dealId}`)
}
