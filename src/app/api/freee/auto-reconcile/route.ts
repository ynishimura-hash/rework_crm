import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'
import { logActivity } from '@/app/actions/activityLogs'

// freee事業所IDを取得するヘルパー
async function getFreeeCompanyId(token: string): Promise<number | null> {
    const res = await fetch('https://api.freee.co.jp/api/1/companies', {
        headers: { 'Authorization': `Bearer ${token}` },
    })
    if (!res.ok) return null
    const data = await res.json()
    return data.companies?.[0]?.id || null
}

// 名前の正規化（全角→半角、スペース・株式会社等の除去）
function normalizeName(name: string): string {
    return name
        .replace(/\s+/g, '')
        .replace(/[\u3000]/g, '')
        .replace(/（株）|株式会社|（有）|有限会社|合同会社|（合）/g, '')
        .replace(/\(株\)|\(有\)|\(合\)/g, '')
        .toLowerCase()
}

// 名前の部分一致判定
function namesMatch(txnDescription: string, invoicePartnerName: string): boolean {
    const normTxn = normalizeName(txnDescription)
    const normPartner = normalizeName(invoicePartnerName)
    if (!normTxn || !normPartner) return false
    return normTxn.includes(normPartner) || normPartner.includes(normTxn)
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

        // 1. 入金明細を取得（直近100件）
        const txnsRes = await fetch(
            `https://api.freee.co.jp/api/1/wallet_txns?company_id=${companyId}&limit=100&entry_side=income`,
            { headers: { 'Authorization': `Bearer ${token}` } }
        )
        if (!txnsRes.ok) {
            return NextResponse.json({ error: 'Failed to fetch wallet transactions' }, { status: txnsRes.status })
        }
        const txnsData = await txnsRes.json()
        const walletTxns = txnsData.wallet_txns || []

        // 2. 未入金請求書を取得
        const invoicesRes = await fetch(
            `https://api.freee.co.jp/api/1/invoices?company_id=${companyId}&payment_status=unsettled&limit=100`,
            { headers: { 'Authorization': `Bearer ${token}` } }
        )
        if (!invoicesRes.ok) {
            return NextResponse.json({ error: 'Failed to fetch unsettled invoices' }, { status: invoicesRes.status })
        }
        const invoicesData = await invoicesRes.json()
        const unsettledInvoices = invoicesData.invoices || []

        // 3. 照合ロジック: 金額一致 + 取引先名の部分一致
        const matches: Array<{
            txn: any
            invoice: any
        }> = []

        for (const invoice of unsettledInvoices) {
            const invoiceAmount = invoice.total_amount || invoice.total_vat_amount || 0
            const partnerName = invoice.partner_name || ''

            if (!invoiceAmount || !partnerName) continue

            // マッチする入金を探す（1つの入金は1つの請求書にのみマッチ）
            const matchedTxn = walletTxns.find((txn: any) => {
                // 金額が一致
                if (txn.amount !== invoiceAmount) return false
                // 名前が部分一致
                if (!namesMatch(txn.description || '', partnerName)) return false
                // 既にマッチ済みでないこと
                if (matches.some(m => m.txn.id === txn.id)) return false
                return true
            })

            if (matchedTxn) {
                matches.push({ txn: matchedTxn, invoice })
            }
        }

        // 4. マッチした組み合わせに対して決済登録
        const results: Array<{ invoice_id: number; partner_name: string; amount: number; status: 'success' | 'skipped' | 'error'; message: string }> = []
        const supabase = createAdminClient()

        for (const { txn, invoice } of matches) {
            try {
                // 請求書の詳細を取得してdeal_idを割り出す
                const invoiceDetailRes = await fetch(
                    `https://api.freee.co.jp/api/1/invoices/${invoice.id}`,
                    { headers: { 'Authorization': `Bearer ${token}` } }
                )
                const invoiceDetail = await invoiceDetailRes.json()
                const freeDealId = invoiceDetail.invoice?.deal_id

                if (!freeDealId) {
                    results.push({
                        invoice_id: invoice.id,
                        partner_name: invoice.partner_name,
                        amount: txn.amount,
                        status: 'skipped',
                        message: 'freee上に対応する取引が未登録のためスキップ',
                    })
                    continue
                }

                // 決済登録
                const paymentRes = await fetch(
                    `https://api.freee.co.jp/api/1/deals/${freeDealId}/payments`,
                    {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${token}`,
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({
                            company_id: companyId,
                            date: txn.date,
                            amount: txn.amount,
                            from_walletable_type: txn.walletable_type || 'bank_account',
                            from_walletable_id: txn.walletable_id,
                        }),
                    }
                )

                if (!paymentRes.ok) {
                    const errData = await paymentRes.json()
                    results.push({
                        invoice_id: invoice.id,
                        partner_name: invoice.partner_name,
                        amount: txn.amount,
                        status: 'error',
                        message: `決済登録に失敗: ${JSON.stringify(errData)}`,
                    })
                    continue
                }

                // CRM側の商談ステータスも更新
                const { data: crmDeals } = await supabase
                    .from('deals')
                    .select('id, title')
                    .eq('freee_invoice_id', invoice.id.toString())

                if (crmDeals && crmDeals.length > 0) {
                    for (const crmDeal of crmDeals) {
                        await supabase
                            .from('deals')
                            .update({ status: '入金確認完了', updated_at: new Date().toISOString() })
                            .eq('id', crmDeal.id)

                        await logActivity('payment_confirmed', `自動消込: ${invoice.partner_name} ¥${txn.amount.toLocaleString()}（商談: ${crmDeal.title}）`, {
                            related_deal_id: crmDeal.id,
                            metadata: { freee_invoice_id: invoice.id, amount: txn.amount, txn_date: txn.date },
                        })
                    }
                }

                results.push({
                    invoice_id: invoice.id,
                    partner_name: invoice.partner_name,
                    amount: txn.amount,
                    status: 'success',
                    message: '決済登録完了・商談ステータス更新済み',
                })
            } catch (err) {
                console.error('Auto-reconcile error for invoice:', invoice.id, err)
                results.push({
                    invoice_id: invoice.id,
                    partner_name: invoice.partner_name,
                    amount: txn.amount,
                    status: 'error',
                    message: '処理中にエラーが発生',
                })
            }
        }

        const successCount = results.filter(r => r.status === 'success').length
        const skippedCount = results.filter(r => r.status === 'skipped').length
        const errorCount = results.filter(r => r.status === 'error').length

        return NextResponse.json({
            success: true,
            summary: {
                total_txns: walletTxns.length,
                total_unsettled: unsettledInvoices.length,
                matched: matches.length,
                reconciled: successCount,
                skipped: skippedCount,
                errors: errorCount,
            },
            results,
        })
    } catch (error) {
        console.error('Auto-reconcile error:', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}
