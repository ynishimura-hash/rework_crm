"use server"

import { revalidatePath } from "next/cache"
import { createAdminClient } from "@/lib/supabase/admin"
import { logActivity } from "./activityLogs"

// ==========================================
// 商談 (Deals) - Supabase CRUD
// ==========================================

export async function getDeals() {
    const supabase = createAdminClient()

    const { data, error } = await supabase
        .from('deals')
        .select(`
            *,
            companies:company_id (id, name),
            contacts:contact_id (id, name)
        `)
        .order('created_at', { ascending: false })

    if (error) {
        console.error("Failed to fetch deals:", error)
        return []
    }
    return data || []
}

export async function getDealById(id: string) {
    const supabase = createAdminClient()

    const { data, error } = await supabase
        .from('deals')
        .select(`
            *,
            companies:company_id (id, name, industry, hp_url),
            contacts:contact_id (id, name, email, phone)
        `)
        .eq('id', id)
        .single()

    if (error) {
        console.error("Failed to fetch deal:", error)
        return null
    }
    return data
}

export async function getDealsByCompanyId(companyId: string) {
    const supabase = createAdminClient()

    const { data, error } = await supabase
        .from('deals')
        .select(`
            *,
            contacts:contact_id (id, name)
        `)
        .eq('company_id', companyId)
        .order('created_at', { ascending: false })

    if (error) {
        console.error("Failed to fetch deals by company:", error)
        return []
    }
    return data || []
}

export async function getDealsByContactId(contactId: string) {
    const supabase = createAdminClient()

    const { data, error } = await supabase
        .from('deals')
        .select(`
            *,
            companies:company_id (id, name)
        `)
        .eq('contact_id', contactId)
        .order('created_at', { ascending: false })

    if (error) {
        console.error("Failed to fetch deals by contact:", error)
        return []
    }
    return data || []
}

export async function createDeal(formData: FormData) {
    const supabase = createAdminClient()

    const companyName = formData.get('companyName') as string
    const amountStr = formData.get('amount') as string

    // 企業名からcompany_idを解決（なければ新規作成）
    let companyId: string | null = null
    if (companyName) {
        const { data: existingCompany } = await supabase
            .from('companies')
            .select('id')
            .eq('name', companyName)
            .maybeSingle()

        if (existingCompany) {
            companyId = existingCompany.id
        } else {
            const { data: newCompany } = await supabase
                .from('companies')
                .insert({ name: companyName, status: '商談中' })
                .select('id')
                .single()
            companyId = newCompany?.id || null
        }
    }

    const expectedAmountStr = formData.get('expected_amount') as string
    const contactId = formData.get('contact_id') as string

    const { data, error } = await supabase
        .from('deals')
        .insert({
            title: formData.get('title') as string || '新規商談',
            company_id: companyId,
            contact_id: contactId || null,
            status: formData.get('status') as string || '提案',
            estimated_amount: amountStr ? parseInt(amountStr, 10) : 0,
            expected_amount: expectedAmountStr ? parseInt(expectedAmountStr, 10) : 0,
            first_appointment_date: formData.get('first_appointment_date') as string || null,
            next_appointment_date: formData.get('next_appointment_date') as string || null,
            action_plan: formData.get('action_plan') as string || null,
            payment_due_date: formData.get('payment_due_date') as string || null,
        })
        .select(`
            *,
            companies:company_id (id, name),
            contacts:contact_id (id, name)
        `)
        .single()

    if (error) {
        console.error("Failed to create deal:", error)
        throw error
    }

    await logActivity('deal_created', `商談「${data.title}」を作成`, {
        related_deal_id: data.id,
        related_company_id: companyId,
        metadata: { title: data.title, amount: data.estimated_amount },
    })

    revalidatePath('/deals')
    return data
}

export async function updateDeal(id: string, formData: FormData | Record<string, any>) {
    const supabase = createAdminClient()

    let updates: Record<string, any> = {}
    if (formData instanceof FormData) {
        formData.forEach((value, key) => {
            updates[key] = value
        })
    } else {
        updates = { ...formData }
    }

    // 金額が文字列の場合は整数にパース
    if (updates.estimated_amount && typeof updates.estimated_amount === 'string') {
        updates.estimated_amount = parseInt(updates.estimated_amount, 10) || 0
    }
    if (updates.expected_amount && typeof updates.expected_amount === 'string') {
        updates.expected_amount = parseInt(updates.expected_amount, 10) || 0
    }
    updates.updated_at = new Date().toISOString()

    const { data, error } = await supabase
        .from('deals')
        .update(updates)
        .eq('id', id)
        .select(`
            *,
            companies:company_id (id, name),
            contacts:contact_id (id, name)
        `)
        .single()

    if (error) {
        console.error("Failed to update deal:", error)
        throw error
    }

    await logActivity('deal_updated', `商談「${data.title}」を更新`, {
        related_deal_id: id,
        related_company_id: data.company_id,
        metadata: { updated_fields: Object.keys(updates) },
    })

    revalidatePath('/deals')
    revalidatePath(`/deals/${id}`)
    return data
}

export async function deleteDeal(id: string) {
    const supabase = createAdminClient()

    // 削除前にログ用の情報を取得
    const { data: dealForLog } = await supabase.from('deals').select('title, company_id').eq('id', id).single()

    const { error } = await supabase.from('deals').delete().eq('id', id)
    if (error) {
        console.error("Failed to delete deal:", error)
        throw error
    }

    if (dealForLog) {
        await logActivity('deal_updated', `商談「${dealForLog.title}」を削除`, {
            related_company_id: dealForLog.company_id,
            metadata: { deleted_deal_id: id },
        })
    }

    revalidatePath('/deals')
}

export async function syncDealFromFreee(invoice: any, partnerName: string) {
    const supabase = createAdminClient()

    // 重複チェック（freee_invoice_id で検索）
    const { data: existing } = await supabase
        .from('deals')
        .select('id')
        .eq('freee_invoice_id', invoice.id.toString())
        .maybeSingle()

    if (existing) {
        return { success: false, message: 'すでに連携済みの商談です', deal: existing, isDuplicate: true }
    }

    // 企業名からcompany_idを解決
    let companyId: string | null = null
    if (partnerName) {
        const { data: company } = await supabase
            .from('companies')
            .select('id')
            .eq('name', partnerName)
            .maybeSingle()

        if (company) {
            companyId = company.id
        } else {
            // 企業が存在しない場合は新規作成
            const { data: newCompany } = await supabase
                .from('companies')
                .insert({ name: partnerName, status: '成約' })
                .select('id')
                .single()
            companyId = newCompany?.id || null
        }
    }

    const { data: newDeal, error } = await supabase
        .from('deals')
        .insert({
            title: invoice.title || `${partnerName}様 請求・入金確認`,
            company_id: companyId,
            status: '入金確認完了',
            estimated_amount: invoice.total_amount || 0,
            close_date: invoice.issue_date || new Date().toISOString().split('T')[0],
            freee_invoice_id: invoice.id.toString(),
        })
        .select(`
            *,
            companies:company_id (id, name),
            contacts:contact_id (id, name)
        `)
        .single()

    if (error) {
        console.error("Failed to sync deal from freee:", error)
        throw error
    }

    await logActivity('freee_synced', `freee請求書からの商談同期「${newDeal.title}」`, {
        related_deal_id: newDeal.id,
        related_company_id: companyId,
        metadata: { freee_invoice_id: invoice.id, partner_name: partnerName },
    })

    revalidatePath('/deals')
    return { success: true, deal: newDeal, isDuplicate: false }
}

export async function syncDealFromFreeeQuotation(quotation: any, partnerName: string) {
    const supabase = createAdminClient()

    // 重複チェック（freee_quotation_id で検索）
    const { data: existing } = await supabase
        .from('deals')
        .select('id')
        .eq('freee_quotation_id', quotation.id.toString())
        .maybeSingle()

    if (existing) {
        return { success: false, message: 'すでに連携済みの見積もりです', deal: existing, isDuplicate: true }
    }

    // 企業名からcompany_idを解決
    let companyId: string | null = null
    if (partnerName) {
        const { data: company } = await supabase
            .from('companies')
            .select('id')
            .eq('name', partnerName)
            .maybeSingle()

        if (company) {
            companyId = company.id
        } else {
            // 企業が存在しない場合は新規作成
            const { data: newCompany } = await supabase
                .from('companies')
                .insert({ name: partnerName, status: '提案' })
                .select('id')
                .single()
            companyId = newCompany?.id || null
        }
    }

    const { data: newDeal, error } = await supabase
        .from('deals')
        .insert({
            title: quotation.title || `${partnerName}様 見積`,
            company_id: companyId,
            status: '見積提出済',
            estimated_amount: quotation.total_amount || 0,
            close_date: quotation.issue_date || new Date().toISOString().split('T')[0],
            freee_quotation_id: quotation.id.toString(),
        })
        .select(`
            *,
            companies:company_id (id, name),
            contacts:contact_id (id, name)
        `)
        .single()

    if (error) {
        console.error("Failed to sync deal from freee quotation:", error)
        throw error
    }

    await logActivity('freee_synced', `freee見積書からの商談同期「${newDeal.title}」`, {
        related_deal_id: newDeal.id,
        related_company_id: companyId,
        metadata: { freee_quotation_id: quotation.id, partner_name: partnerName },
    })

    revalidatePath('/deals')
    return { success: true, deal: newDeal, isDuplicate: false }
}

