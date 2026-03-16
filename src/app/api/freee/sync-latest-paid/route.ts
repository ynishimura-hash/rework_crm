import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { syncDealFromFreee } from '@/app/actions/deals';

export async function POST(request: Request) {
    try {
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

        // 2. 最新の入金済み請求書を1件取得
        const invoicesResponse = await fetch(`https://api.freee.co.jp/api/1/invoices?company_id=${companyId}&payment_status=settled&limit=1`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const invoicesData = await invoicesResponse.json();

        if (!invoicesResponse.ok) {
            return NextResponse.json({ error: 'Failed to fetch invoices' }, { status: invoicesResponse.status });
        }

        if (!invoicesData.invoices || invoicesData.invoices.length === 0) {
            return NextResponse.json({ success: false, message: '入金済みの請求書が見つかりませんでした。' });
        }

        const latestInvoice = invoicesData.invoices[0];
        const partnerId = latestInvoice.partner_id;

        // 3. 取引先の名前を取得
        const partnerResponse = await fetch(`https://api.freee.co.jp/api/1/partners/${partnerId}?company_id=${companyId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const partnerData = await partnerResponse.json();
        const partnerName = partnerResponse.ok && partnerData.partner ? partnerData.partner.name : 'Unknown Partner';

        // 4. CRMに商談と取引先データとして同期・作成する
        const syncResult = await syncDealFromFreee(latestInvoice, partnerName);

        if (!syncResult.success) {
            return NextResponse.json({
                success: false,
                message: syncResult.message,
                isDuplicate: syncResult.isDuplicate,
                dealId: syncResult.deal?.id
            });
        }

        return NextResponse.json({
            success: true,
            message: '最新の入金済み請求書から商談データを連携・作成しました！',
            dealId: syncResult.deal.id
        });

    } catch (error) {
        console.error('Error syncing latest paid invoice:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
