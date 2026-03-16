import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export async function GET(request: Request) {
    try {
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

        // 2. 未入金の請求書を取得する (payment_status=unsettled, limit=50)
        // さらに、取引先や発行日などで取得条件を絞ることも可能ですが、まずは最新の未入金一覧を取得
        const invoicesResponse = await fetch(`https://api.freee.co.jp/api/1/invoices?company_id=${companyId}&payment_status=unsettled&limit=50&sort=issue_date,desc`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        const invoicesResult = await invoicesResponse.json();

        if (!invoicesResponse.ok) {
            console.error("freee API fetch unsettled invoices error:", invoicesResult);
            return NextResponse.json({
                error: 'Failed to fetch unsettled invoices',
                details: invoicesResult
            }, { status: invoicesResponse.status });
        }

        return NextResponse.json({
            success: true,
            data: invoicesResult.invoices
        });

    } catch (error) {
        console.error('Error fetching freee unsettled invoices:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
