import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

// ハザード一括保存
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const supabase = createAdminClient();

    const { data, error } = await supabase
      .from('safety_hazards')
      .insert(body.hazards)
      .select();

    if (error) throw error;
    return NextResponse.json(data || []);
  } catch (error) {
    console.error('Failed to save hazards:', error);
    return NextResponse.json({ error: 'ハザードの保存に失敗しました' }, { status: 500 });
  }
}
