import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const companyName = searchParams.get('company_name');

        if (!companyName) {
            return NextResponse.json({ error: 'Missing company name' }, { status: 400 });
        }

        const cookieStore = await cookies();
        const token = cookieStore.get('freee_access_token')?.value;

        if (!token) {
            return NextResponse.json({ error: 'Not authenticated with freee' }, { status: 401 });
        }

        // 1. 事業所一覧から対象事業所IDを取得
        const companiesResponse = await fetch('https://api.freee.co.jp/api/1/companies', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const companiesData = await companiesResponse.json();

        if (!companiesResponse.ok) {
            return NextResponse.json({ error: 'Failed to find company in freee' }, { status: companiesResponse.status });
        }
        if (!companiesData.companies || companiesData.companies.length === 0) {
            return NextResponse.json({ error: 'No company found in freee' }, { status: 404 });
        }

        const companyId = companiesData.companies[0].id;

        // 2. 取引先(partner)IDの取得
        const partnersResponse = await fetch(`https://api.freee.co.jp/api/1/partners?company_id=${companyId}&keyword=${encodeURIComponent(companyName)}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        const partnersData = await partnersResponse.json();

        if (!partnersResponse.ok || !partnersData.partners || partnersData.partners.length === 0) {
            // 取引先がまだ存在しない場合は空として返す
            return NextResponse.json({
                success: true,
                data: { invoices: [], quotations: [] }
            });
        }

        const partnerId = partnersData.partners[0].id;

        // 3. 請求書一覧の取得（新API + 旧APIの両方を取得して統合）
        const [newInvoicesRes, oldInvoicesRes, newQuotationsRes, oldQuotationsRes] = await Promise.all([
            // 新API (2023-10以降)
            fetch(`https://api.freee.co.jp/iv/invoices?company_id=${companyId}&partner_id=${partnerId}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            }),
            // 旧API (2023-10以前)
            fetch(`https://api.freee.co.jp/api/1/invoices?company_id=${companyId}&partner_id=${partnerId}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            }),
            // 新API 見積書
            fetch(`https://api.freee.co.jp/iv/quotations?company_id=${companyId}&partner_id=${partnerId}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            }),
            // 旧API 見積書
            fetch(`https://api.freee.co.jp/api/1/quotations?company_id=${companyId}&partner_id=${partnerId}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            }),
        ]);

        const newInvoicesData = newInvoicesRes.ok ? await newInvoicesRes.json() : {};
        const oldInvoicesData = oldInvoicesRes.ok ? await oldInvoicesRes.json() : {};
        const newQuotationsData = newQuotationsRes.ok ? await newQuotationsRes.json() : {};
        const oldQuotationsData = oldQuotationsRes.ok ? await oldQuotationsRes.json() : {};

        // 新旧APIの結果を統合（IDで重複除外）
        const newInvoices = newInvoicesData.invoices || [];
        const oldInvoices = (oldInvoicesData.invoices || []).map((inv: any) => ({
            ...inv,
            id: inv.id,
            title: inv.title || inv.subject || inv.invoice_number || '',
            total_amount: inv.total_amount,
            issue_date: inv.issue_date,
            due_date: inv.due_date,
            payment_status: inv.payment_status,
            invoice_status: inv.invoice_status,
            _legacy: true,
        }));
        const seenInvoiceIds = new Set(newInvoices.map((i: any) => String(i.id)));
        const mergedInvoices = [...newInvoices, ...oldInvoices.filter((i: any) => !seenInvoiceIds.has(String(i.id)))];

        const newQuotations = newQuotationsData.quotations || [];
        const oldQuotations = (oldQuotationsData.quotations || []).map((q: any) => ({
            ...q,
            id: q.id,
            title: q.title || q.subject || q.quotation_number || '',
            total_amount: q.total_amount,
            issue_date: q.issue_date,
            quotation_status: q.quotation_status,
            _legacy: true,
        }));
        const seenQuotationIds = new Set(newQuotations.map((q: any) => String(q.id)));
        const mergedQuotations = [...newQuotations, ...oldQuotations.filter((q: any) => !seenQuotationIds.has(String(q.id)))];

        return NextResponse.json({
            success: true,
            data: {
                invoices: mergedInvoices,
                quotations: mergedQuotations
            }
        });

    } catch (error) {
        console.error('Error fetching partner documents:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
