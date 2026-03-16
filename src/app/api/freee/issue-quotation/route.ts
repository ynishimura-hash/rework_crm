import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export async function POST(request: Request) {
    try {
        const cookieStore = await cookies();
        const token = cookieStore.get('freee_access_token')?.value;

        if (!token) {
            return NextResponse.json({ error: 'Not authenticated with freee' }, { status: 401 });
        }

        const body = await request.json();
        const { quotation_id } = body;

        if (!quotation_id) {
            return NextResponse.json({ error: 'quotation_id is required' }, { status: 400 });
        }

        // 1. まず事業所一覧から対象事業所IDを取得
        const companiesResponse = await fetch('https://api.freee.co.jp/api/1/companies', {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!companiesResponse.ok) {
            return NextResponse.json({ error: 'Failed to fetch freee companies' }, { status: companiesResponse.status });
        }

        const companiesData = await companiesResponse.json();
        if (companiesData.companies.length === 0) {
            return NextResponse.json({ error: 'No company found in freee' }, { status: 404 });
        }

        const companyId = companiesData.companies[0].id;

        // 2. 見積書のステータスを "issue" に更新する
        const updateData = {
            company_id: companyId,
            quotation_status: 'issue'
        };

        const updateResponse = await fetch(`https://api.freee.co.jp/iv/quotations/${quotation_id}`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(updateData)
        });

        const updateResult = await updateResponse.json();

        if (!updateResponse.ok) {
            console.error("freee API update quotation error:", updateResult);
            // 既にissueになっているなどのエラーはスキップできるようにハンドリング
            if (updateResult.errors?.[0]?.messages?.[0]?.includes('quotation_status')) {
                return NextResponse.json({ success: true, message: 'Already issued or status error ignored', data: updateResult });
            }
            return NextResponse.json({
                error: 'Failed to update quotation status',
                details: updateResult
            }, { status: updateResponse.status });
        }

        return NextResponse.json({
            success: true,
            message: '見積書を発行(送付)済みに変更しました！',
            data: updateResult
        });

    } catch (error) {
        console.error('Error issuing freee quotation:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
