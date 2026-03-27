import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

interface RegisterBody {
  company?: {
    name?: string;
    industry?: string;
    address?: string;
    hp_url?: string;
  };
  contact?: {
    last_name?: string;
    first_name?: string;
    furigana?: string;
    department?: string;
    position?: string;
    email?: string;
    phone?: string;
  };
  // 重複解決済みの場合に指定
  resolvedDuplicate?: {
    contactId: string; // 既存contactのID
    fields: Record<string, string | null>; // ユーザーが選択した最終値
  };
  forceNew?: boolean; // 同一メールでも新規作成（別人）
}

export async function POST(request: NextRequest) {
  try {
    const body: RegisterBody = await request.json();
    const supabase = createAdminClient();

    let companyId: string | null = null;
    let companyAction: 'created' | 'matched' | 'skipped' = 'skipped';

    // === 企業の処理 ===
    if (body.company?.name) {
      // 会社名の正規化比較で既存チェック
      const { data: existingCompanies } = await supabase
        .from('companies')
        .select('id, name');

      const normalized = normalizeCompanyName(body.company.name);
      const match = (existingCompanies || []).find(
        (c: any) => normalizeCompanyName(c.name) === normalized
      );

      if (match) {
        companyId = match.id;
        companyAction = 'matched';
      } else {
        const { data: newCompany, error } = await supabase
          .from('companies')
          .insert({
            name: body.company.name,
            industry: body.company.industry || null,
            address: body.company.address || null,
            hp_url: body.company.hp_url || null,
            status: '見込み',
          })
          .select('id')
          .single();

        if (error) throw error;
        companyId = newCompany.id;
        companyAction = 'created';

        await supabase.from('activity_logs').insert({
          action_type: 'company_created',
          description: `名刺スキャンから企業「${body.company.name}」を登録`,
          related_company_id: companyId,
          metadata: { source: 'scan', original_data: body.company },
        });
      }
    }

    // === 担当者の処理 ===
    let contactId: string | null = null;
    let contactAction: 'created' | 'matched' | 'updated' | 'skipped' = 'skipped';

    if (body.contact?.last_name || body.contact?.first_name) {
      const contactName = `${body.contact?.last_name || ''} ${body.contact?.first_name || ''}`.trim();

      // ケース1: 重複解決済み（ユーザーが差分UIで選択した結果）
      if (body.resolvedDuplicate) {
        contactId = body.resolvedDuplicate.contactId;
        const updates = { ...body.resolvedDuplicate.fields, updated_at: new Date().toISOString() };
        if (companyId) (updates as any).company_id = companyId;

        await supabase
          .from('contacts')
          .update(updates)
          .eq('id', contactId);

        contactAction = 'updated';
      }
      // ケース2: 新規作成を強制（同一メールだが別人）
      else if (body.forceNew) {
        const { data: newContact, error } = await supabase
          .from('contacts')
          .insert({
            name: contactName,
            last_name: body.contact?.last_name || null,
            first_name: body.contact?.first_name || null,
            furigana: body.contact?.furigana || null,
            department: body.contact?.department || null,
            position: body.contact?.position || null,
            email: body.contact?.email || null,
            phone: body.contact?.phone || null,
            company_id: companyId,
            priority: '中',
          })
          .select('id')
          .single();

        if (error) throw error;
        contactId = newContact.id;
        contactAction = 'created';
      }
      // ケース3: 通常の登録（メールで重複チェック）
      else {
        // メールアドレスで重複チェック
        if (body.contact?.email) {
          const { data: existingContact } = await supabase
            .from('contacts')
            .select('id, name, last_name, first_name, furigana, department, position, email, phone, company_id, companies:company_id(id, name)')
            .eq('email', body.contact.email)
            .maybeSingle();

          if (existingContact) {
            // 重複あり → 差分データを返してフロントに選択させる
            const diffs = buildDiffs(existingContact, body.contact);

            return NextResponse.json({
              success: false,
              duplicate: true,
              existingContact: {
                id: existingContact.id,
                name: existingContact.name,
                last_name: existingContact.last_name,
                first_name: existingContact.first_name,
                furigana: existingContact.furigana,
                department: existingContact.department,
                position: existingContact.position,
                email: existingContact.email,
                phone: existingContact.phone,
                company_name: (existingContact as any).companies?.name,
              },
              newContact: {
                name: contactName,
                last_name: body.contact?.last_name || null,
                first_name: body.contact?.first_name || null,
                furigana: body.contact?.furigana || null,
                department: body.contact?.department || null,
                position: body.contact?.position || null,
                email: body.contact?.email || null,
                phone: body.contact?.phone || null,
                company_name: body.company?.name || null,
              },
              diffs,
              company: { id: companyId, action: companyAction },
            });
          }
        }

        // 重複なし → 新規作成
        const { data: newContact, error } = await supabase
          .from('contacts')
          .insert({
            name: contactName,
            last_name: body.contact?.last_name || null,
            first_name: body.contact?.first_name || null,
            furigana: body.contact?.furigana || null,
            department: body.contact?.department || null,
            position: body.contact?.position || null,
            email: body.contact?.email || null,
            phone: body.contact?.phone || null,
            company_id: companyId,
            priority: '中',
          })
          .select('id')
          .single();

        if (error) throw error;
        contactId = newContact.id;
        contactAction = 'created';
      }
    }

    return NextResponse.json({
      success: true,
      company: { id: companyId, action: companyAction },
      contact: { id: contactId, action: contactAction },
    });
  } catch (error) {
    console.error('Scan register error:', error);
    return NextResponse.json(
      { error: '顧客の登録に失敗しました' },
      { status: 500 }
    );
  }
}

// 差分のある項目を抽出
function buildDiffs(existing: any, newData: any): Array<{ field: string; label: string; existing: string | null; new: string | null }> {
  const fieldMap: Array<{ key: string; label: string; existingKey?: string }> = [
    { key: 'last_name', label: '姓' },
    { key: 'first_name', label: '名' },
    { key: 'furigana', label: 'ふりがな' },
    { key: 'department', label: '部署' },
    { key: 'position', label: '役職' },
    { key: 'phone', label: '電話' },
  ];

  return fieldMap
    .map(({ key, label }) => ({
      field: key,
      label,
      existing: existing[key] || null,
      new: newData[key] || null,
    }))
    .filter(d => d.existing !== d.new && (d.existing || d.new));
}

function normalizeCompanyName(name: string): string {
  return name
    .replace(/[\s　]+/g, '')
    .replace(/\(株\)|（株）/g, '株式会社')
    .replace(/\(有\)|（有）/g, '有限会社')
    .replace(/\(合\)|（合）/g, '合同会社')
    .replace(/\(社\)|（社）/g, '一般社団法人')
    .toLowerCase();
}
