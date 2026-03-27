import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { searchCompanyHP, enrichFromWebsite } from '@/lib/gemini';

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
      .select('id, name, hp_url, industry, address')
      .eq('id', companyId)
      .single();

    if (error || !company) {
      return NextResponse.json({ error: '企業が見つかりません' }, { status: 404 });
    }

    const companyData: any = {
      company: {
        name: company.name,
        hp_url: company.hp_url,
        industry: company.industry,
        address: company.address,
      }
    };

    let enriched: any = companyData;
    let enrichedFields: string[] = [];

    // 1) hp_urlがある場合はWebサイトから補完
    if (company.hp_url) {
      enriched = await enrichFromWebsite(companyData);
    }
    // 2) hp_urlがない場合はGeminiで検索
    else if (company.name) {
      const hpInfo = await searchCompanyHP(company.name);
      const updatedCompany = { ...companyData.company };

      if (hpInfo.hp_url) {
        updatedCompany.hp_url = hpInfo.hp_url;
        enrichedFields.push('WebサイトURL');
      }
      if (hpInfo.industry && !updatedCompany.industry) {
        updatedCompany.industry = hpInfo.industry;
        enrichedFields.push('業種');
      }
      if (hpInfo.address && !updatedCompany.address) {
        updatedCompany.address = hpInfo.address;
        enrichedFields.push('住所');
      }

      enriched = { company: updatedCompany };

      // hp_urlが見つかったらさらにWebサイトから詳細を補完
      if (hpInfo.hp_url) {
        enriched = await enrichFromWebsite(enriched);
      }
    }

    // 補完された項目を特定
    const updates: Record<string, string | null> = {};
    if (enriched.company.hp_url && enriched.company.hp_url !== company.hp_url) {
      updates.hp_url = enriched.company.hp_url;
      if (!enrichedFields.includes('WebサイトURL')) enrichedFields.push('WebサイトURL');
    }
    if (enriched.company.industry && enriched.company.industry !== company.industry) {
      updates.industry = enriched.company.industry;
      if (!enrichedFields.includes('業種')) enrichedFields.push('業種');
    }
    if (enriched.company.address && enriched.company.address !== company.address) {
      updates.address = enriched.company.address;
      if (!enrichedFields.includes('住所')) enrichedFields.push('住所');
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
      metadata: { source: 'scan_enrich', enriched_fields: enrichedFields, updates },
    });

    return NextResponse.json({
      success: true,
      enrichedFields,
      updates,
    });
  } catch (error) {
    console.error('Enrich error:', error);
    return NextResponse.json({ error: 'HP情報の取得に失敗しました' }, { status: 500 });
  }
}
