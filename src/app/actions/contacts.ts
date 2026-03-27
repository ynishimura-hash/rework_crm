"use server"

import { revalidatePath } from "next/cache"
import { createAdminClient } from "@/lib/supabase/admin"

// ==========================================
// 担当者 (Contacts) - Supabase CRUD
// ==========================================

export async function getContacts() {
    const supabase = createAdminClient()

    const { data, error } = await supabase
        .from('contacts')
        .select(`
            *,
            companies:company_id (id, name)
        `)
        .order('created_at', { ascending: false })

    if (error) {
        console.error("Failed to fetch contacts:", error)
        return []
    }
    return data || []
}

export async function getContactById(id: string) {
    const supabase = createAdminClient()

    const { data, error } = await supabase
        .from('contacts')
        .select(`
            *,
            companies:company_id (id, name, industry, hp_url)
        `)
        .eq('id', id)
        .single()

    if (error) {
        console.error("Failed to fetch contact:", error)
        return null
    }
    return data
}

export async function getContactsByCompanyId(companyId: string) {
    const supabase = createAdminClient()

    const { data, error } = await supabase
        .from('contacts')
        .select('*')
        .eq('company_id', companyId)
        .order('name')

    if (error) {
        console.error("Failed to fetch contacts by company:", error)
        return []
    }
    return data || []
}

export async function createContact(formData: FormData) {
    const supabase = createAdminClient()

    const { data, error } = await supabase
        .from('contacts')
        .insert({
            company_id: formData.get('company_id') as string || null,
            last_name: formData.get('last_name') as string || null,
            first_name: formData.get('first_name') as string || null,
            name: formData.get('name') as string || `${formData.get('last_name') || ''} ${formData.get('first_name') || ''}`.trim(),
            furigana: formData.get('furigana') as string || null,
            department: formData.get('department') as string || null,
            position: formData.get('position') as string || null,
            email: formData.get('email') as string || null,
            phone: formData.get('phone') as string || null,
            priority: formData.get('priority') as string || '中',
        })
        .select()
        .single()

    if (error) {
        console.error("Failed to create contact:", error)
        throw error
    }
    revalidatePath('/contacts')
    return data
}

export async function updateContact(id: string, formData: FormData) {
    const supabase = createAdminClient()

    const updates: Record<string, any> = {}
    const fields = ['name', 'last_name', 'first_name', 'furigana', 'department', 'position', 'email', 'phone', 'priority', 'company_id']
    for (const field of fields) {
        const value = formData.get(field)
        if (value !== null && value !== undefined) updates[field] = value
    }
    updates.updated_at = new Date().toISOString()

    const { data, error } = await supabase
        .from('contacts')
        .update(updates)
        .eq('id', id)
        .select()
        .single()

    if (error) {
        console.error("Failed to update contact:", error)
        throw error
    }
    revalidatePath(`/contacts/${id}`)
    revalidatePath('/contacts')
    return data
}

export async function deleteContact(id: string, company_id?: string) {
    const supabase = createAdminClient()
    const { error } = await supabase.from('contacts').delete().eq('id', id)
    if (error) {
        console.error("Failed to delete contact:", error)
        throw error
    }
    revalidatePath('/contacts')
    if (company_id) revalidatePath(`/companies/${company_id}`)
}
