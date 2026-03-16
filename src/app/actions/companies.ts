"use server"

import { revalidatePath } from "next/cache"
import { createAdminClient } from "@/lib/supabase/admin"
import { logActivity } from "./activityLogs"

// ==========================================
// 企業 (Companies) - Supabase CRUD
// ==========================================

export async function getCompanies() {
    const supabase = createAdminClient()

    const { data, error } = await supabase
        .from('companies')
        .select(`
            *,
            contacts (id, name, email, phone, priority),
            deals (id, title, status, estimated_amount)
        `)
        .order('name', { ascending: true })

    if (error) {
        console.error("Failed to fetch companies:", error)
        return []
    }
    return data || []
}

export async function getCompanyById(id: string) {
    const supabase = createAdminClient()

    const { data, error } = await supabase
        .from('companies')
        .select(`
            *,
            contacts (id, name, email, phone, department, position, priority),
            deals (id, title, status, estimated_amount, close_date, freee_invoice_id)
        `)
        .eq('id', id)
        .single()

    if (error) {
        console.error("Failed to fetch company:", error)
        return null
    }
    return data
}

export async function createCompany(formData: FormData) {
    const supabase = createAdminClient()

    const { data, error } = await supabase
        .from('companies')
        .insert({
            name: formData.get('name') as string,
            industry: formData.get('industry') as string || null,
            hp_url: formData.get('hp_url') as string || null,
            status: formData.get('status') as string || '見込み',
            summary: formData.get('summary') as string || null,
            address: formData.get('address') as string || null,
            internal_staff: formData.get('internal_staff') as string || null,
            referral_source: formData.get('referral_source') as string || null,
        })
        .select()
        .single()

    if (error) {
        console.error("Failed to create company:", error)
        throw error
    }

    await logActivity('company_created', `企業「${data.name}」を作成`, {
        related_company_id: data.id,
        metadata: { name: data.name, industry: data.industry },
    })

    revalidatePath('/companies')
    return data
}

export async function updateCompany(id: string, formData: FormData) {
    const supabase = createAdminClient()

    const updates: Record<string, any> = {}
    const fields = ['name', 'industry', 'hp_url', 'status', 'summary', 'address', 'internal_staff', 'referral_source']
    for (const field of fields) {
        const value = formData.get(field)
        if (value !== null && value !== undefined) updates[field] = value
    }
    updates.updated_at = new Date().toISOString()

    const { data, error } = await supabase
        .from('companies')
        .update(updates)
        .eq('id', id)
        .select()
        .single()

    if (error) {
        console.error("Failed to update company:", error)
        throw error
    }
    revalidatePath(`/companies/${id}`)
    revalidatePath('/companies')
    return data
}

export async function deleteCompany(id: string) {
    const supabase = createAdminClient()
    const { error } = await supabase.from('companies').delete().eq('id', id)
    if (error) {
        console.error("Failed to delete company:", error)
        throw error
    }
    revalidatePath('/companies')
}
