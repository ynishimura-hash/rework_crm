import { NextRequest, NextResponse } from "next/server"
import { syncDealFromFreee, syncDealFromFreeeQuotation } from "@/app/actions/deals"
import { logActivity } from "@/app/actions/activityLogs"

export async function GET(req: NextRequest) {
    const accessToken = req.cookies.get('freee_access_token')?.value

    if (!accessToken) {
        return NextResponse.json({ error: 'Unauthorized: No freee access token' }, { status: 401 })
    }

    try {
        // 1. 事業所IDを取得
        const meRes = await fetch('https://api.freee.co.jp/api/1/users/me', {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        })
        const meData = await meRes.json()
        const companyId = meData.user?.companies?.[0]?.id

        if (!companyId) {
            return NextResponse.json({ error: 'Company ID not found' }, { status: 404 })
        }

        let importedInvoices = 0
        let importedQuotations = 0
        let settledCount = 0
        let errors = []

        // 2. 請求書一覧を全件取得
        let invoiceOffset = 0
        const LIMIT = 100
        while (true) {
            const invoicesRes = await fetch(`https://api.freee.co.jp/api/1/invoices?company_id=${companyId}&limit=${LIMIT}&offset=${invoiceOffset}`, {
                headers: { 'Authorization': `Bearer ${accessToken}` }
            })
            const { invoices } = await invoicesRes.json()
            
            if (!invoices || invoices.length === 0) break

            for (const inv of invoices) {
                try {
                    const result = await syncDealFromFreee(inv, inv.partner_name)
                    if (result.success) {
                        importedInvoices++
                        if (inv.payment_status === 'settled') settledCount++
                    }
                } catch (e: any) {
                    errors.push(`Invoice ${inv.id}: ${e.message}`)
                }
            }

            if (invoices.length < LIMIT) break
            invoiceOffset += LIMIT
        }

        // 3. 見積書一覧を全件取得
        let quotationOffset = 0
        while (true) {
            const quotationsRes = await fetch(`https://api.freee.co.jp/api/1/quotations?company_id=${companyId}&limit=${LIMIT}&offset=${quotationOffset}`, {
                headers: { 'Authorization': `Bearer ${accessToken}` }
            })
            const { quotations } = await quotationsRes.json()

            if (!quotations || quotations.length === 0) break

            for (const qt of quotations) {
                try {
                    const result = await syncDealFromFreeeQuotation(qt, qt.partner_name)
                    if (result.success) {
                        importedQuotations++
                    }
                } catch (e: any) {
                    errors.push(`Quotation ${qt.id}: ${e.message}`)
                }
            }

            if (quotations.length < LIMIT) break
            quotationOffset += LIMIT
        }

        // 4. 活動ログに記録
        await logActivity('freee_import', `freee書類の一括同期を実行: 請求書${importedInvoices}件、見積書${importedQuotations}件（うち入金確認済${settledCount}件）`, {
            metadata: {
                imported_invoices: importedInvoices,
                imported_quotations: importedQuotations,
                settled_count: settledCount,
                errors: errors.slice(0, 10) // 最初の一部だけ
            }
        })

        return NextResponse.json({
            success: true,
            imported_invoices: importedInvoices,
            imported_quotations: importedQuotations,
            settled_count: settledCount,
            errors: errors
        })

    } catch (error: any) {
        console.error('Sync all error:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
