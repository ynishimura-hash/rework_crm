import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

// 点検写真を保存
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const supabase = createAdminClient();

    const { data, error } = await supabase
      .from('safety_inspection_photos')
      .insert({
        inspection_id: body.inspection_id,
        photo_url: body.photo_url,
        photo_location: body.photo_location || null,
        ai_raw_response: body.ai_raw_response || null,
        analyzed_at: body.ai_raw_response ? new Date().toISOString() : null,
      })
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json(data);
  } catch (error) {
    console.error('Failed to save photo:', error);
    return NextResponse.json({ error: '写真の保存に失敗しました' }, { status: 500 });
  }
}
