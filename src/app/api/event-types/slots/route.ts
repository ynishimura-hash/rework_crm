import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

// GET /api/event-types/slots?eventTypeId=xxx
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const eventTypeId = searchParams.get('eventTypeId');
  if (!eventTypeId) {
    return NextResponse.json({ error: 'Missing eventTypeId' }, { status: 400 });
  }

  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from('scheduling_event_type_slots')
    .select('*')
    .eq('event_type_id', eventTypeId)
    .order('date')
    .order('start_time');

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ slots: data || [] });
}
// POST /api/event-types/slots - Bulk save slots
export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { eventTypeId, slots } = await request.json();
  if (!eventTypeId || !Array.isArray(slots)) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  const serviceClient = createServiceRoleClient();

  // Verify ownership
  const { data: et } = await serviceClient
    .from('scheduling_event_types')
    .select('id')
    .eq('id', eventTypeId)
    .eq('user_id', user.id)
    .single();

  if (!et) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  // Delete existing slots and insert new ones
  await serviceClient
    .from('scheduling_event_type_slots')
    .delete()
    .eq('event_type_id', eventTypeId);

  if (slots.length > 0) {
    const toInsert = slots.map((s: { date: string; startTime: string; endTime: string; isAllDay: boolean }) => ({
      event_type_id: eventTypeId,
      date: s.date,
      start_time: s.startTime,
      end_time: s.endTime,
      is_all_day: s.isAllDay || false,
    }));

    const { error } = await serviceClient
      .from('scheduling_event_type_slots')
      .insert(toInsert);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  return NextResponse.json({ success: true });
}