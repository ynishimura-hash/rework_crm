"use server"

import { revalidatePath } from "next/cache"
import { createAdminClient } from "@/lib/supabase/admin"

export async function getServices() {
    const supabase = createAdminClient()
    const { data, error } = await supabase
        .from('services')
        .select('*')
        .order('name', { ascending: true })

    if (error) {
        console.error("Failed to fetch services:", error)
        return []
    }
    return data || []
}

export async function getServiceById(id: string) {
    const supabase = createAdminClient()
    const { data, error } = await supabase
        .from('services')
        .select('*')
        .eq('id', id)
        .single()

    if (error) {
        console.error("Failed to fetch service:", error)
        return null
    }
    return data
}

export async function createService(formData: FormData) {
    const supabase = createAdminClient()
    const priceStr = formData.get('base_price') as string
    const { data, error } = await supabase
        .from('services')
        .insert({
            name: formData.get('name') as string,
            base_price: priceStr ? parseInt(priceStr, 10) : 0,
            unit: formData.get('unit') as string || null,
            is_active: true,
        })
        .select()
        .single()

    if (error) {
        console.error("Failed to create service:", error)
        throw error
    }
    revalidatePath('/services')
    return data
}

export async function updateService(id: string, formData: FormData) {
    const supabase = createAdminClient()
    const updates: Record<string, unknown> = {}
    const fields = ['name', 'unit']
    for (const field of fields) {
        const value = formData.get(field)
        if (value !== null && value !== undefined) updates[field] = value
    }
    const priceStr = formData.get('base_price') as string
    if (priceStr !== null) updates.base_price = parseInt(priceStr, 10) || 0
    const isActive = formData.get('is_active')
    if (isActive !== null) updates.is_active = isActive === 'true'
    updates.updated_at = new Date().toISOString()

    const { data, error } = await supabase
        .from('services')
        .update(updates)
        .eq('id', id)
        .select()
        .single()

    if (error) {
        console.error("Failed to update service:", error)
        throw error
    }
    revalidatePath('/services')
    return data
}

export async function deleteService(id: string) {
    const supabase = createAdminClient()
    const { error } = await supabase.from('services').delete().eq('id', id)
    if (error) {
        console.error("Failed to delete service:", error)
        throw error
    }
    revalidatePath('/services')
}
