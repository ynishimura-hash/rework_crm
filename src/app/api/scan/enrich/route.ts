import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { searchCompanyHP, fetchAndAnalyzeHP } from '@/lib/gemini';

// HP情報の非同期取得API
// 登録後にフロントからfire-and-forgetで呼ばれる
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const { companyId } = await request.json();
    if (!companyId) {
      return NextResponse.json({ error: 'companyId is required' }, { status: 400 });
    }

    const supabase = createAdminClient();

    // 企業情報を取得
    const { data: company, error } = await supabase
      .from('companies')
      .select('id, name, hp_url, industry, address, representative, established_year, employee_count, capital, business_description, phone')
      .eq('id', companyId)
      .single();

    if (error || !company) {
      return NextResponse.json({ error: '企業が見つかりません' }, { status: 404 });
    }

    let hpUrl = company.hp_url;
    const enrichedFields: string[] = [];
    const updates: Record<string, string | null> = {};

    // Step 1: hp_urlがない場合はGeminiで検索
    if (!hpUrl && company.name) {
      const hpInfo = await searchCompanyHP(company.name);
      if (hpInfo.hp_url) {
        hpUrl = hpInfo.hp_url;
        updates.hp_url = hpUrl;
        enrichedFields.push('WebサイトURL');
      }
      // Gemini知識ベースから取得できた基本情報も保存
      if (hpInfo.industry && !company.industry) {
        updates.industry = hpInfo.industry;
        enrichedFields.push('業種');
      }
      if (hpInfo.address && !company.address) {
        updates.address = hpInfo.address;
        enrichedFields.push('住所');
      }
    }

    // Step 2: HPがあれば詳細情報を取得
    if (hpUrl) {
      const hpData = await fetchAndAnalyzeHP(hpUrl, company.name);

      if (hpData) {
        // 既存データがない項目のみ補完
        const fieldMap: Array<{ key: string; label: string }> = [
          { key: 'industry', label: '業種' },
          { key: 'address', label: '住所' },
          { key: 'representative', label: '代表者' },
          { key: 'established_year', label: '設立年' },
          { key: 'employee_count', label: '従業員数' },
          { key: 'capital', label: '資本金' },
          { key: 'business_description', label: '事業内容' },
          { key: 'phone', label: '代表電話番号' },
        ];

        for (const { key, label } of fieldMap) {
          const newVal = (hpData as any)[key];
          const existingVal = (company as any)[key];
          if (newVal && !existingVal && !updates[key]) {
            updates[key] = newVal;
            if (!enrichedFields.includes(label)) enrichedFields.push(label);
          }
        }
      }
    }

    // DBを更新
    if (Object.keys(updates).length > 0) {
      updates.updated_at = new Date().toISOString();
      await supabase
        .from('companies')
        .update(updates)
        .eq('id', companyId);
    }

    // 通知を作成
    const hasUpdates = enrichedFields.length > 0;
    await supabase.from('notifications').insert({
      title: hasUpdates
        ? `${company.name}のHP情報を取得しました`
        : `${company.name}のHP情報取得が完了しました`,
      message: hasUpdates
        ? `${enrichedFields.join('・')}を自動補完しました。`
        : '追加情報は見つかりませんでした。',
      type: hasUpdates ? 'success' : 'info',
      link: `/companies/${companyId}`,
      related_company_id: companyId,
      metadata: { source: 'scan_enrich', enriched_fields: enrichedFields },
    });

    return NextResponse.json({
      success: true,
      enrichedFields,
    });
  } catch (error) {
    console.error('Enrich error:', error);
    return NextResponse.json({ error: 'HP情報の取得に失敗しました' }, { status: 500 });
  }
}
