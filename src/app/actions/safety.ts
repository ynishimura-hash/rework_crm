"use server"

import { revalidatePath } from "next/cache"
import { createAdminClient } from "@/lib/supabase/admin"

// ==========================================
// 現場 (Safety Sites) - CRUD
// ==========================================

export async function getSafetySites() {
    const supabase = createAdminClient()

    const { data, error } = await supabase
        .from('safety_sites')
        .select(`
            *,
            safety_inspections (id, inspection_date, overall_score, total_hazards, critical_count, status)
        `)
        .order('created_at', { ascending: false })

    if (error) {
        console.error("Failed to fetch safety sites:", error)
        return []
    }
    return data || []
}

export async function getSafetySiteById(id: string) {
    const supabase = createAdminClient()

    const { data, error } = await supabase
        .from('safety_sites')
        .select(`
            *,
            safety_inspections (
                id, inspector_name, inspection_date, weather,
                overall_score, total_hazards, critical_count, status, summary,
                created_at
            )
        `)
        .eq('id', id)
        .single()

    if (error) {
        console.error("Failed to fetch safety site:", error)
        return null
    }

    // 点検を日付降順にソート
    if (data?.safety_inspections) {
        data.safety_inspections.sort((a: { inspection_date: string }, b: { inspection_date: string }) =>
            new Date(b.inspection_date).getTime() - new Date(a.inspection_date).getTime()
        )
    }

    return data
}

export async function createSafetySite(formData: FormData) {
    const supabase = createAdminClient()

    const { data, error } = await supabase
        .from('safety_sites')
        .insert({
            name: formData.get('name') as string,
            address: formData.get('address') as string || null,
            company_id: formData.get('company_id') as string || null,
            site_manager: formData.get('site_manager') as string || null,
            notes: formData.get('notes') as string || null,
        })
        .select()
        .single()

    if (error) {
        console.error("Failed to create safety site:", error)
        throw error
    }

    revalidatePath('/safety')
    return data
}

export async function updateSafetySite(id: string, formData: FormData) {
    const supabase = createAdminClient()

    const updates: Record<string, unknown> = {}
    const fields = ['name', 'address', 'company_id', 'site_manager', 'status', 'notes']
    for (const field of fields) {
        const value = formData.get(field)
        if (value !== null && value !== undefined) updates[field] = value
    }
    updates.updated_at = new Date().toISOString()

    const { data, error } = await supabase
        .from('safety_sites')
        .update(updates)
        .eq('id', id)
        .select()
        .single()

    if (error) {
        console.error("Failed to update safety site:", error)
        throw error
    }

    revalidatePath(`/safety/sites/${id}`)
    revalidatePath('/safety')
    return data
}

// ==========================================
// 点検 (Safety Inspections) - CRUD
// ==========================================

export async function createInspection(data: {
    site_id: string
    inspector_name: string
    inspection_date: string
    weather?: string
}) {
    const supabase = createAdminClient()

    const { data: inspection, error } = await supabase
        .from('safety_inspections')
        .insert({
            site_id: data.site_id,
            inspector_name: data.inspector_name,
            inspection_date: data.inspection_date,
            weather: data.weather || null,
            status: '実施中',
        })
        .select()
        .single()

    if (error) {
        console.error("Failed to create inspection:", error)
        throw error
    }

    return inspection
}

export async function getInspectionById(id: string) {
    const supabase = createAdminClient()

    const { data, error } = await supabase
        .from('safety_inspections')
        .select(`
            *,
            safety_sites (id, name, address),
            safety_inspection_photos (
                id, photo_url, photo_location, ai_raw_response, analyzed_at,
                safety_hazards (*)
            )
        `)
        .eq('id', id)
        .single()

    if (error) {
        console.error("Failed to fetch inspection:", error)
        return null
    }
    return data
}

export async function saveInspectionPhoto(data: {
    inspection_id: string
    photo_url: string
    photo_location?: string
    ai_raw_response?: object
}) {
    const supabase = createAdminClient()

    const { data: photo, error } = await supabase
        .from('safety_inspection_photos')
        .insert({
            inspection_id: data.inspection_id,
            photo_url: data.photo_url,
            photo_location: data.photo_location || null,
            ai_raw_response: data.ai_raw_response || null,
            analyzed_at: data.ai_raw_response ? new Date().toISOString() : null,
        })
        .select()
        .single()

    if (error) {
        console.error("Failed to save inspection photo:", error)
        throw error
    }

    return photo
}

export async function saveHazards(hazards: Array<{
    photo_id: string
    inspection_id: string
    site_id: string
    severity: string
    category: string
    description: string
    law_reference?: string
    law_detail?: string
    recommendation?: string
    bbox_x?: number
    bbox_y?: number
    bbox_w?: number
    bbox_h?: number
}>) {
    if (hazards.length === 0) return []

    const supabase = createAdminClient()

    const { data, error } = await supabase
        .from('safety_hazards')
        .insert(hazards)
        .select()

    if (error) {
        console.error("Failed to save hazards:", error)
        throw error
    }

    return data || []
}

export async function completeInspection(id: string, summary?: string) {
    const supabase = createAdminClient()

    // ハザード統計を集計
    const { data: hazards } = await supabase
        .from('safety_hazards')
        .select('severity')
        .eq('inspection_id', id)

    const totalHazards = hazards?.length || 0
    const criticalCount = hazards?.filter(h => h.severity === 'critical').length || 0

    // スコア計算: 危険度に応じた減点方式
    let score = 100
    hazards?.forEach(h => {
        switch (h.severity) {
            case 'critical': score -= 25; break
            case 'high': score -= 15; break
            case 'medium': score -= 8; break
            case 'low': score -= 3; break
        }
    })
    score = Math.max(0, score)

    const { data, error } = await supabase
        .from('safety_inspections')
        .update({
            status: '完了',
            overall_score: score,
            total_hazards: totalHazards,
            critical_count: criticalCount,
            summary: summary || null,
            updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select()
        .single()

    if (error) {
        console.error("Failed to complete inspection:", error)
        throw error
    }

    revalidatePath('/safety')
    return data
}

// ==========================================
// 現場一覧用の簡易取得（サイト + 最新点検）
// ==========================================

export async function getSafetySitesWithLatestScore() {
    const supabase = createAdminClient()

    const { data: sites, error } = await supabase
        .from('safety_sites')
        .select('*')
        .order('created_at', { ascending: false })

    if (error) {
        console.error("Failed to fetch safety sites:", error)
        return []
    }

    // 各現場の最新点検を取得
    const result = await Promise.all(
        (sites || []).map(async (site) => {
            const { data: inspections } = await supabase
                .from('safety_inspections')
                .select('id, inspection_date, overall_score, total_hazards, critical_count, status')
                .eq('site_id', site.id)
                .eq('status', '完了')
                .order('inspection_date', { ascending: false })
                .limit(1)

            return {
                ...site,
                latest_inspection: inspections?.[0] || null,
                inspection_count: 0, // 後で集計
            }
        })
    )

    return result
}
