import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

// 現場一覧取得（セレクトボックス用）
export async function GET() {
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from('safety_sites')
      .select('id, name')
      .order('name', { ascending: true });

    if (error) throw error;
    return NextResponse.json(data || []);
  } catch (error) {
    console.error('Failed to fetch safety sites:', error);
    return NextResponse.json([], { status: 500 });
  }
}
