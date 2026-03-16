import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

// POST /api/calendar/event-settings - Toggle allow_overlap for a Google Calendar event
export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { googleEventId, allowOverlap, eventSummary, eventStart, eventEnd } = await request.json();

  if (!googleEventId) {
    return NextResponse.json({ error: 'Missing googleEventId' }, { status: 400 });
  }

  const serviceClient = createServiceRoleClient();

  const { data, error } = await serviceClient
    .from('scheduling_calendar_event_settings')
    .upsert({
      user_id: user.id,
      google_event_id: googleEventId,
      allow_overlap: allowOverlap,
      event_summary: eventSummary,
      event_start: eventStart,
      event_end: eventEnd,
      updated_at: new Date().toISOString(),
    }, {
      onConflict: 'user_id,google_event_id',
    })
    .select()
    .single();

  if (error) {
    console.error('Failed to update event settings:', error);
    return NextResponse.json({ error: 'Failed to update' }, { status: 500 });
  }

  return NextResponse.json({ setting: data });
}
