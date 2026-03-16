import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const invoiceId = searchParams.get('id');

        if (!invoiceId) {
            return NextResponse.json({ error: 'Missing invoice ID' }, { status: 400 });
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

        // 2. 請求書の取得（新帳票API）
        const invoiceResponse = await fetch(`https://api.freee.co.jp/iv/invoices/${invoiceId}?company_id=${companyId}`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (invoiceResponse.ok) {
            const invoiceResult = await invoiceResponse.json();

            if (invoiceResult?.invoice?.cancel_status === 'canceled') {
                return NextResponse.json({
                    success: true,
                    is_deleted: true,
                });
            }

            return NextResponse.json({
                success: true,
                data: invoiceResult.invoice
            });
        }

        // 新帳票APIで404の場合、旧帳票APIで試す（2023年10月以前の請求書）
        if (invoiceResponse.status === 404) {
            try {
                const oldApiResponse = await fetch(`https://api.freee.co.jp/api/1/invoices/${invoiceId}?company_id=${companyId}`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });

                if (oldApiResponse.ok) {
                    const oldResult = await oldApiResponse.json();
                    return NextResponse.json({
                        success: true,
                        data: {
                            ...oldResult.invoice,
                            _legacy: true,
                        }
                    });
                }

                if (oldApiResponse.status === 404) {
                    return NextResponse.json({
                        success: true,
                        is_deleted: true,
                    });
                }
            } catch (e) {
                console.error("Old invoice API fallback failed:", e);
            }

            // 両方404の場合のみ削除扱い
            return NextResponse.json({
                success: true,
                is_deleted: true,
            });
        }

        // その他のエラー
        const invoiceResult = await invoiceResponse.json();
        console.error("freee API fetch invoice error:", invoiceResult);
        return NextResponse.json({
            error: 'Failed to fetch invoice',
            details: invoiceResult
        }, { status: invoiceResponse.status });

    } catch (error) {
        console.error('Error fetching freee invoice:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
