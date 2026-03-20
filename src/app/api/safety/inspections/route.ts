import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

// 点検レコード作成
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const supabase = createAdminClient();

    const { data, error } = await supabase
      .from('safety_inspections')
      .insert({
        site_id: body.site_id,
        inspector_name: body.inspector_name,
        inspection_date: body.inspection_date,
        weather: body.weather || null,
        status: '実施中',
      })
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json(data);
  } catch (error) {
    console.error('Failed to create inspection:', error);
    return NextResponse.json({ error: '点検の作成に失敗しました' }, { status: 500 });
  }
}
