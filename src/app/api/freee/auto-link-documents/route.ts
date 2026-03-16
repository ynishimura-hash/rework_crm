import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'
import { logActivity } from '@/app/actions/activityLogs'

// freee事業所IDを取得
async function getFreeeCompanyId(token: string): Promise<number | null> {
    const res = await fetch('https://api.freee.co.jp/api/1/companies', {
        headers: { 'Authorization': `Bearer ${token}` },
    })
    if (!res.ok) return null
    const data = await res.json()
    return data.companies?.[0]?.id || null
}

// 名前の正規化
function normalizeName(name: string): string {
    return name
        .replace(/\s+/g, '')
        .replace(/[\u3000]/g, '')
        .replace(/（株）|株式会社|（有）|有限会社|合同会社|（合）/g, '')
        .replace(/\(株\)|\(有\)|\(合\)/g, '')
        .toLowerCase()
}

function namesMatch(a: string, b: string): boolean {
    const na = normalizeName(a)
    const nb = normalizeName(b)
    if (!na || !nb) return false
    return na.includes(nb) || nb.includes(na)
}

export async function POST() {
    try {
        const cookieStore = await cookies()
        const token = cookieStore.get('freee_access_token')?.value

        if (!token) {
            return NextResponse.json({ error: 'Not authenticated with freee' }, { status: 401 })
        }

        const companyId = await getFreeeCompanyId(token)
        if (!companyId) {
            return NextResponse.json({ error: 'Failed to get freee company ID' }, { status: 404 })
        }

        const supabase = createAdminClient()

        // 1. 未連携の商談を取得（見積書or請求書のどちらかが未連携）
        const { data: unlinkedDeals, error: dealsError } = await supabase
            .from('deals')
            .select(`
                id, title, estimated_amount, freee_quotation_id, freee_invoice_id,
                companies:company_id (id, name)
            `)
            .or('freee_quotation_id.is.null,freee_invoice_id.is.null')

        if (dealsError || !unlinkedDeals) {
            return NextResponse.json({ error: 'Failed to fetch unlinked deals' }, { status: 500 })
        }

        // 企業名が設定されていて金額がある商談のみ対象
        const targetDeals = unlinkedDeals.filter((d: any) =>
            d.companies?.name && d.estimated_amount && d.estimated_amount > 0
        )

        if (targetDeals.length === 0) {
            return NextResponse.json({
                success: true,
                summary: { total_unlinked: unlinkedDeals.length, target: 0, linked_quotations: 0, linked_invoices: 0 },
                results: [],
            })
        }

        // 2. 対象企業名の一覧（重複排除）
        const companyNames = [...new Set(targetDeals.map((d: any) => d.companies.name))]

        // 3. 各企業のfreee書類を取得
        const companyDocuments: Record<string, { invoices: any[], quotations: any[] }> = {}

        for (const name of companyNames) {
            try {
                // 取引先IDを取得
                const partnersRes = await fetch(
                    `https://api.freee.co.jp/api/1/partners?company_id=${companyId}&keyword=${encodeURIComponent(name)}`,
                    { headers: { 'Authorization': `Bearer ${token}` } }
                )
                const partnersData = await partnersRes.json()
                if (!partnersRes.ok || !partnersData.partners?.length) continue

                const partnerId = partnersData.partners[0].id

                // 新旧API両方から取得
                const [newQRes, oldQRes, newIRes, oldIRes] = await Promise.all([
                    fetch(`https://api.freee.co.jp/iv/quotations?company_id=${companyId}&partner_id=${partnerId}`, {
                        headers: { 'Authorization': `Bearer ${token}` }
                    }),
                    fetch(`https://api.freee.co.jp/api/1/quotations?company_id=${companyId}&partner_id=${partnerId}`, {
                        headers: { 'Authorization': `Bearer ${token}` }
                    }),
                    fetch(`https://api.freee.co.jp/iv/invoices?company_id=${companyId}&partner_id=${partnerId}`, {
                        headers: { 'Authorization': `Bearer ${token}` }
                    }),
                    fetch(`https://api.freee.co.jp/api/1/invoices?company_id=${companyId}&partner_id=${partnerId}`, {
                        headers: { 'Authorization': `Bearer ${token}` }
                    }),
                ])

                const newQ = newQRes.ok ? (await newQRes.json()).quotations || [] : []
                const oldQ = oldQRes.ok ? (await oldQRes.json()).quotations || [] : []
                const newI = newIRes.ok ? (await newIRes.json()).invoices || [] : []
                const oldI = oldIRes.ok ? (await oldIRes.json()).invoices || [] : []

                // 重複排除して統合
                const qIds = new Set(newQ.map((q: any) => String(q.id)))
                const mergedQ = [...newQ, ...oldQ.filter((q: any) => !qIds.has(String(q.id)))]

                const iIds = new Set(newI.map((i: any) => String(i.id)))
                const mergedI = [...newI, ...oldI.filter((i: any) => !iIds.has(String(i.id)))]

                companyDocuments[name] = { quotations: mergedQ, invoices: mergedI }
            } catch (e) {
                console.error(`Failed to fetch documents for ${name}:`, e)
            }
        }

        // 4. 金額マッチングで自動連携
        const results: Array<{
            deal_id: string
            deal_title: string
            company_name: string
            amount: number
            linked_quotation_id: string | null
            linked_invoice_id: string | null
            status: 'linked' | 'no_match' | 'error'
            message: string
        }> = []

        // 既に連携済みのIDを収集（重複連携を防止）
        const { data: allDeals } = await supabase
            .from('deals')
            .select('freee_quotation_id, freee_invoice_id')
        const usedQuotationIds = new Set(
            (allDeals || []).map((d: any) => d.freee_quotation_id).filter(Boolean)
        )
        const usedInvoiceIds = new Set(
            (allDeals || []).map((d: any) => d.freee_invoice_id).filter(Boolean)
        )

        for (const deal of targetDeals) {
            const companyName = (deal as any).companies.name
            const docs = companyDocuments[companyName]
            if (!docs) {
                results.push({
                    deal_id: deal.id,
                    deal_title: deal.title,
                    company_name: companyName,
                    amount: deal.estimated_amount,
                    linked_quotation_id: null,
                    linked_invoice_id: null,
                    status: 'no_match',
                    message: 'freeeに取引先が見つかりません',
                })
                continue
            }

            const dealAmount = Number(deal.estimated_amount)
            const updates: Record<string, any> = {}

            // 見積書マッチ（金額一致かつ未使用）
            if (!deal.freee_quotation_id) {
                const matchQ = docs.quotations.find((q: any) =>
                    Number(q.total_amount) === dealAmount && !usedQuotationIds.has(String(q.id))
                )
                if (matchQ) {
                    updates.freee_quotation_id = String(matchQ.id)
                    usedQuotationIds.add(String(matchQ.id))
                }
            }

            // 請求書マッチ（金額一致かつ未使用）
            if (!deal.freee_invoice_id) {
                const matchI = docs.invoices.find((inv: any) =>
                    Number(inv.total_amount) === dealAmount && !usedInvoiceIds.has(String(inv.id))
                )
                if (matchI) {
                    updates.freee_invoice_id = String(matchI.id)
                    usedInvoiceIds.add(String(matchI.id))
                }
            }

            if (Object.keys(updates).length === 0) {
                results.push({
                    deal_id: deal.id,
                    deal_title: deal.title,
                    company_name: companyName,
                    amount: dealAmount,
                    linked_quotation_id: null,
                    linked_invoice_id: null,
                    status: 'no_match',
                    message: `金額¥${dealAmount.toLocaleString()}に一致する書類が見つかりません`,
                })
                continue
            }

            try {
                updates.updated_at = new Date().toISOString()
                await supabase.from('deals').update(updates).eq('id', deal.id)

                const linkedParts = []
                if (updates.freee_quotation_id) linkedParts.push(`見積書(${updates.freee_quotation_id})`)
                if (updates.freee_invoice_id) linkedParts.push(`請求書(${updates.freee_invoice_id})`)

                await logActivity('freee_auto_linked', `自動連携: ${deal.title} → ${linkedParts.join(' + ')}`, {
                    related_deal_id: deal.id,
                    related_company_id: (deal as any).companies.id,
                    metadata: { ...updates, amount: dealAmount },
                })

                results.push({
                    deal_id: deal.id,
                    deal_title: deal.title,
                    company_name: companyName,
                    amount: dealAmount,
                    linked_quotation_id: updates.freee_quotation_id || null,
                    linked_invoice_id: updates.freee_invoice_id || null,
                    status: 'linked',
                    message: `連携成功: ${linkedParts.join(' + ')}`,
                })
            } catch (e) {
                console.error('Auto-link error for deal:', deal.id, e)
                results.push({
                    deal_id: deal.id,
                    deal_title: deal.title,
                    company_name: companyName,
                    amount: dealAmount,
                    linked_quotation_id: null,
                    linked_invoice_id: null,
                    status: 'error',
                    message: '連携処理中にエラーが発生',
                })
            }
        }

        const linkedCount = results.filter(r => r.status === 'linked').length
        const linkedQ = results.filter(r => r.linked_quotation_id).length
        const linkedI = results.filter(r => r.linked_invoice_id).length

        return NextResponse.json({
            success: true,
            summary: {
                total_unlinked: unlinkedDeals.length,
                target: targetDeals.length,
                linked: linkedCount,
                linked_quotations: linkedQ,
                linked_invoices: linkedI,
                no_match: results.filter(r => r.status === 'no_match').length,
                errors: results.filter(r => r.status === 'error').length,
            },
            results,
        })
    } catch (error) {
        console.error('Auto-link documents error:', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}
