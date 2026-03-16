import { createServerSupabaseClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

// POST /api/availability/overrides
export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const { date, isBlocked, startTime, endTime } = body;

  if (!date) {
    return NextResponse.json({ error: 'Date is required' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('scheduling_availability_overrides')
    .upsert({
      user_id: user.id,
      date,
      is_blocked: isBlocked,
      start_time: startTime,
      end_time: endTime,
    }, {
      onConflict: 'user_id,date',
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ override: data });
}