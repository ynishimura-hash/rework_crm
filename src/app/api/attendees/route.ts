import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

// GET /api/attendees?eventTypeId=xxx
export async function GET(request: Request) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const eventTypeId = searchParams.get('eventTypeId');
  if (!eventTypeId) return NextResponse.json({ error: 'eventTypeId required' }, { status: 400 });

  const serviceClient = createServiceRoleClient();
  const { data: attendees } = await serviceClient
    .from('scheduling_event_type_attendees')
    .select('id, user_id, is_required')
    .eq('event_type_id', eventTypeId);

  const userIds = (attendees || []).map(a => a.user_id);
  let users: { id: string; name: string; email: string; avatar_url: string }[] = [];
  if (userIds.length > 0) {
    const { data } = await serviceClient
      .from('scheduling_users')
      .select('id, name, email, avatar_url')
      .in('id', userIds);
    users = data || [];
  }

  const result = (attendees || []).map(a => ({
    ...a,
    user: users.find(u => u.id === a.user_id),
  }));

  return NextResponse.json({ attendees: result });
}

// POST /api/attendees - Add/update attendees for event type
export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const { eventTypeId, attendeeUserIds } = body;
  if (!eventTypeId) return NextResponse.json({ error: 'eventTypeId required' }, { status: 400 });

  const serviceClient = createServiceRoleClient();

  // Replace all attendees
  await serviceClient
    .from('scheduling_event_type_attendees')
    .delete()
    .eq('event_type_id', eventTypeId);

  if (attendeeUserIds && attendeeUserIds.length > 0) {
    const rows = attendeeUserIds.map((uid: string) => ({
      event_type_id: eventTypeId,
      user_id: uid,
      is_required: true,
    }));
    const { error } = await serviceClient
      .from('scheduling_event_type_attendees')
      .insert(rows);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
