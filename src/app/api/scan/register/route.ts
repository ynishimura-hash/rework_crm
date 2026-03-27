import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { checkDuplicates } from '@/lib/gemini';

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
}

export async function POST(request: NextRequest) {
  try {
    const body: RegisterBody = await request.json();
    const supabase = createAdminClient();

    // Fetch existing companies and contacts for dedup check
    const [companiesRes, contactsRes] = await Promise.all([
      supabase.from('companies').select('id, name'),
      supabase.from('contacts').select('id, name, email, companies(name)'),
    ]);

    const existingCompanies = (companiesRes.data || []).map((c: any) => ({
      id: c.id,
      name: c.name,
    }));

    const existingContacts = (contactsRes.data || []).map((c: any) => ({
      id: c.id,
      name: c.name,
      email: c.email,
      company_name: c.companies?.name,
    }));

    // AI deduplication check
    const { companyMatch, contactMatch } = await checkDuplicates(
      body,
      existingCompanies,
      existingContacts
    );

    let companyId: string | null = null;
    let contactId: string | null = null;
    let companyAction: 'created' | 'matched' | 'skipped' = 'skipped';
    let contactAction: 'created' | 'matched' | 'skipped' = 'skipped';

    // Handle company
    if (body.company?.name) {
      if (companyMatch && companyMatch.confidence >= 80) {
        // High confidence match - use existing
        companyId = companyMatch.id;
        companyAction = 'matched';
      } else {
        // Create new company
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

        // Log activity
        await supabase.from('activity_logs').insert({
          action_type: 'company_created',
          description: `名刺スキャンから企業「${body.company.name}」を登録`,
          related_company_id: companyId,
          metadata: { source: 'scan', original_data: body.company },
        });
      }
    }

    // Handle contact
    if (body.contact?.last_name || body.contact?.first_name) {
      const contactName = `${body.contact?.last_name || ''} ${body.contact?.first_name || ''}`.trim();

      if (contactMatch && contactMatch.confidence >= 80) {
        // High confidence match - use existing
        contactId = contactMatch.id;
        contactAction = 'matched';

        // 既存担当者の情報を最新のスキャン結果で更新
        const contactName = `${body.contact?.last_name || ''} ${body.contact?.first_name || ''}`.trim();
        const updates: Record<string, string | null> = {};
        if (contactName) updates.name = contactName;
        if (body.contact?.last_name) updates.last_name = body.contact.last_name;
        if (body.contact?.first_name) updates.first_name = body.contact.first_name;
        if (body.contact?.furigana) updates.furigana = body.contact.furigana;
        if (body.contact?.department) updates.department = body.contact.department;
        if (body.contact?.position) updates.position = body.contact.position;
        if (body.contact?.phone) updates.phone = body.contact.phone;
        if (body.contact?.email) updates.email = body.contact.email;
        if (companyId) updates.company_id = companyId;

        if (Object.keys(updates).length > 0) {
          await supabase
            .from('contacts')
            .update({ ...updates, updated_at: new Date().toISOString() })
            .eq('id', contactId);
        }
      } else {
        // Create new contact
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
      company: {
        id: companyId,
        action: companyAction,
        matchedName: companyMatch?.name,
        confidence: companyMatch?.confidence,
      },
      contact: {
        id: contactId,
        action: contactAction,
        matchedName: contactMatch?.name,
        confidence: contactMatch?.confidence,
      },
    });
  } catch (error) {
    console.error('Scan register error:', error);
    return NextResponse.json(
      { error: '顧客の登録に失敗しました' },
      { status: 500 }
    );
  }
}
