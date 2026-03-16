import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

// 請求書に対する入金（決済登録）を行うエンドポイント
export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { invoice_id, amount, date, from_walletable_type, from_walletable_id } = body;

        if (!invoice_id || !amount || !date) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        const cookieStore = await cookies();
        const token = cookieStore.get('freee_access_token')?.value;

        if (!token) {
            return NextResponse.json({ error: 'Not authenticated with freee' }, { status: 401 });
        }

        // 1. 事業所一覧から対象事業所IDを取得
        const companiesResponse = await fetch('https://api.freee.co.jp/api/1/companies', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        const companiesData = await companiesResponse.json();
        if (!companiesResponse.ok) {
            return NextResponse.json({ error: 'Failed to find company in freee' }, { status: companiesResponse.status });
        }
        if (!companiesData.companies || companiesData.companies.length === 0) {
            return NextResponse.json({ error: 'No company found in freee' }, { status: 404 });
        }
        const companyId = companiesData.companies[0].id;

        // 2. 請求書の詳細を取得し、deal_id (取引ID) を割り出す
        // freeeの決済登録 (POST /api/1/deals/{id}/payments) は invoice_id ではなく deal_id に対して行う必要があるため
        const invoiceResponse = await fetch(`https://api.freee.co.jp/api/1/invoices/${invoice_id}`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        const invoiceData = await invoiceResponse.json();
        
        if (!invoiceResponse.ok || !invoiceData.invoice?.deal_id) {
            return NextResponse.json({ error: 'Failed to find corresponding deal for the invoice' }, { status: 404 });
        }
        const dealId = invoiceData.invoice.deal_id;

        // 3. 決済登録 (Payment) を作成する
        const paymentPayload = {
            company_id: companyId,
            date: date, // 'YYYY-MM-DD'
            amount: amount,
            from_walletable_type: from_walletable_type || 'bank_account', 
            from_walletable_id: from_walletable_id // どの口座に入金されたか
        };

        const paymentResponse = await fetch(`https://api.freee.co.jp/api/1/deals/${dealId}/payments`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(paymentPayload)
        });

        const paymentResult = await paymentResponse.json();

        if (!paymentResponse.ok) {
            console.error("freee API payment registration error:", paymentResult);
            return NextResponse.json({
                error: 'Failed to register payment',
                details: paymentResult
            }, { status: paymentResponse.status });
        }

        return NextResponse.json({
            success: true,
            data: paymentResult.payment
        });

    } catch (error) {
        console.error('Error registering freee payment:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
