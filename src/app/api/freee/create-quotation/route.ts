import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export async function POST(request: Request) {
    try {
        // 1. クッキーからアクセストークンを取得
        const cookieStore = await cookies();
        const token = cookieStore.get('freee_access_token')?.value;

        if (!token) {
            return NextResponse.json({ error: 'Not authenticated with freee' }, { status: 401 });
        }

        // （オプショナル）事業所一覧を取得し、その事業所ID(company_id)を使う
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

        // 2. reqのbodyから請求書の情報を取得
        const body = await request.json();
        const {
            title,
            amount,
            description,
            issue_date,
            billing_date,
            due_date,
            quantity = 1,
            unit = '式',
            note = '',
            company_name = 'テスト受託会社(CRM自動生成)'
        } = body;

        // 3. 取引先(partner)の取得 (名前で検索)
        const partnersResponse = await fetch(`https://api.freee.co.jp/api/1/partners?company_id=${companyId}&keyword=${encodeURIComponent(company_name)}`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        const partnersData = await partnersResponse.json();
        let targetPartnerId = null;

        if (partnersData.partners && partnersData.partners.length > 0) {
            targetPartnerId = partnersData.partners[0].id;
        } else {
            // テスト用事業所で取引先が見つからない場合は新規作成する
            const createPartnerRes = await fetch('https://api.freee.co.jp/api/1/partners', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    company_id: companyId,
                    name: company_name
                })
            });
            const newPartnerData = await createPartnerRes.json();
            if (newPartnerData.partner) {
                targetPartnerId = newPartnerData.partner.id;
            } else {
                return NextResponse.json({ error: 'Failed to find or create a partner in freee', details: newPartnerData }, { status: 400 });
            }
        }

        // デフォルト日付のフォールバック
        const today = new Date();
        const todayStr = today.toISOString().split('T')[0];
        const nextMonthEnd = new Date(today.getFullYear(), today.getMonth() + 2, 0);
        const nextMonthEndStr = nextMonthEnd.toISOString().split('T')[0];

        // 4. freee APIで見積書を作成
        const quotationData = {
            company_id: companyId,
            partner_id: targetPartnerId,
            subject: title || 'CRMからの見積書',
            quotation_date: issue_date || todayStr, // 見積日（API新仕様では quotation_date）
            description: note,
            partner_title: "御中",
            tax_entry_method: "out", // 外税
            tax_fraction: "omit", // 切り捨て
            withholding_tax_entry_method: "out", // 源泉徴収(外税)
            lines: [
                {
                    type: "item",
                    quantity: quantity,
                    unit: unit,
                    unit_price: String(amount || 0),
                    description: description || "システム開発費",
                    tax_rate: 10 // 10%
                }
            ]
        };

        const createResponse = await fetch('https://api.freee.co.jp/iv/quotations', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(quotationData)
        });

        const createResult = await createResponse.json();

        if (!createResponse.ok) {
            console.error("freee API create quotation error:", createResult);
            return NextResponse.json({
                error: 'Failed to create quotation',
                details: createResult
            }, { status: createResponse.status });
        }

        return NextResponse.json({
            success: true,
            message: '見積書のドラフトがfreeeに作成されました！',
            data: createResult
        });

    } catch (error) {
        console.error('Error creating freee quotation:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
