import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const quotationId = searchParams.get('id');

        if (!quotationId) {
            return NextResponse.json({ error: 'Missing quotation ID' }, { status: 400 });
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

        // 2. 見積書の取得（新帳票API）
        const quotationResponse = await fetch(`https://api.freee.co.jp/iv/quotations/${quotationId}?company_id=${companyId}`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (quotationResponse.ok) {
            const quotationResult = await quotationResponse.json();

            if (quotationResult?.quotation?.cancel_status === 'canceled') {
                return NextResponse.json({
                    success: true,
                    is_deleted: true,
                });
            }

            return NextResponse.json({
                success: true,
                data: quotationResult.quotation
            });
        }

        // 新帳票APIで404の場合、旧帳票APIで試す（2023年10月以前の見積書）
        if (quotationResponse.status === 404) {
            try {
                const oldApiResponse = await fetch(`https://api.freee.co.jp/api/1/quotations/${quotationId}?company_id=${companyId}`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });

                if (oldApiResponse.ok) {
                    const oldResult = await oldApiResponse.json();
                    return NextResponse.json({
                        success: true,
                        data: {
                            ...oldResult.quotation,
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
                console.error("Old quotation API fallback failed:", e);
            }

            // 両方404の場合のみ削除扱い
            return NextResponse.json({
                success: true,
                is_deleted: true,
            });
        }

        // その他のエラー
        const quotationResult = await quotationResponse.json();
        console.error("freee API fetch quotation error:", quotationResult);
        return NextResponse.json({
            error: 'Failed to fetch quotation',
            details: quotationResult
        }, { status: quotationResponse.status });

    } catch (error) {
        console.error('Error fetching freee quotation:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
