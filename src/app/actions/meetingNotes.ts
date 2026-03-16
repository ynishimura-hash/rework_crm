"use server"

import { revalidatePath } from "next/cache"
import { createAdminClient } from "@/lib/supabase/admin"

export async function getMeetingNotes() {
    const supabase = createAdminClient()
    const { data, error } = await supabase
        .from('meeting_notes')
        .select(`
            *,
            contact:contact_id (id, name),
            deal:deal_id (id, title)
        `)
        .order('meeting_date', { ascending: false })

    if (error) {
        console.error("Failed to fetch meeting notes:", error)
        return []
    }
    return data || []
}

export async function getMeetingNotesByDealId(dealId: string) {
    const supabase = createAdminClient()
    const { data, error } = await supabase
        .from('meeting_notes')
        .select(`
            *,
            contact:contact_id (id, name)
        `)
        .eq('deal_id', dealId)
        .order('meeting_date', { ascending: false })

    if (error) {
        console.error("Failed to fetch meeting notes:", error)
        return []
    }
    return data || []
}

export async function createMeetingNote(formData: FormData) {
    const supabase = createAdminClient()
    const { data, error } = await supabase
        .from('meeting_notes')
        .insert({
            title: formData.get('title') as string,
            meeting_date: formData.get('meeting_date') as string || null,
            contact_id: formData.get('contact_id') as string || null,
            deal_id: formData.get('deal_id') as string || null,
            note_url: formData.get('note_url') as string || null,
            memo: formData.get('memo') as string || null,
        })
        .select()
        .single()

    if (error) {
        console.error("Failed to create meeting note:", error)
        throw error
    }
    revalidatePath('/deals')
    return data
}

export async function updateMeetingNote(id: string, formData: FormData) {
    const supabase = createAdminClient()
    const updates: Record<string, unknown> = {}
    const fields = ['title', 'meeting_date', 'contact_id', 'deal_id', 'note_url', 'memo']
    for (const field of fields) {
        const value = formData.get(field)
        if (value !== null && value !== undefined) updates[field] = value || null
    }
    updates.updated_at = new Date().toISOString()

    const { data, error } = await supabase
        .from('meeting_notes')
        .update(updates)
        .eq('id', id)
        .select()
        .single()

    if (error) {
        console.error("Failed to update meeting note:", error)
        throw error
    }
    revalidatePath('/deals')
    return data
}

export async function deleteMeetingNote(id: string) {
    const supabase = createAdminClient()
    const { error } = await supabase.from('meeting_notes').delete().eq('id', id)
    if (error) {
        console.error("Failed to delete meeting note:", error)
        throw error
    }
    revalidatePath('/deals')
}
