import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export async function GET(request: Request) {
    try {
        const cookieStore = await cookies();
        const token = cookieStore.get('freee_access_token')?.value;

        if (!token) {
            return NextResponse.json({ error: 'Not authenticated with freee' }, { status: 401 });
        }

        // 1. まず事業所一覧から対象事業所IDを取得
        const companiesResponse = await fetch('https://api.freee.co.jp/api/1/companies', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!companiesResponse.ok) {
            return NextResponse.json({ error: 'Failed to fetch freee companies' }, { status: companiesResponse.status });
        }

        const companiesData = await companiesResponse.json();
        if (companiesData.companies.length === 0) {
            return NextResponse.json({ error: 'No company found in freee' }, { status: 404 });
        }

        const companyId = companiesData.companies[0].id;

        const { searchParams } = new URL(request.url);
        const limit = searchParams.get('limit') || '10';

        // 2. 直近の明細(wallet_txns)を取得する（入出金明細）
        // entry_side: "income"（入金のみ）
        const txnsResponse = await fetch(`https://api.freee.co.jp/api/1/wallet_txns?company_id=${companyId}&limit=${limit}&entry_side=income`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        const txnsResult = await txnsResponse.json();

        if (!txnsResponse.ok) {
            console.error("freee API fetch wallet_txns error:", txnsResult);
            return NextResponse.json({
                error: 'Failed to fetch wallet txns',
                details: txnsResult
            }, { status: txnsResponse.status });
        }

        return NextResponse.json({
            success: true,
            data: txnsResult.wallet_txns
        });

    } catch (error) {
        console.error('Error fetching freee wallet txns:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
