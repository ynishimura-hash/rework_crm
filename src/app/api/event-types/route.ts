import { createServiceRoleClient, createServerSupabaseClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

// GET /api/event-types - returns all allowed members' event types
export async function GET() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const serviceClient = createServiceRoleClient();

  // Get allowed members
  const { data: allowedMembers } = await serviceClient
    .from('scheduling_allowed_members')
    .select('email');
  const allowedEmails = (allowedMembers || []).map(m => m.email).filter(Boolean);

  // Get allowed users
  const { data: allowedUsers } = await serviceClient
    .from('scheduling_users')
    .select('id, name, email')
    .in('email', allowedEmails.length > 0 ? allowedEmails : ['__none__']);

  const allUserIds = (allowedUsers || []).map(u => u.id);
  const userNameMap: Record<string, string> = {};
  (allowedUsers || []).forEach(u => { userNameMap[u.id] = u.name || u.email; });

  // Get event types for all allowed members
  const [{ data: types }, { data: pages }] = await Promise.all([
    serviceClient.from('scheduling_event_types').select('*')
      .in('user_id', allUserIds.length > 0 ? allUserIds : [user.id])
      .order('created_at', { ascending: false }),
    serviceClient.from('scheduling_booking_pages').select('slug, user_id')
      .in('user_id', allUserIds.length > 0 ? allUserIds : [user.id]),
  ]);

  const bookingPageSlugs: Record<string, string> = {};
  (pages || []).forEach(p => { bookingPageSlugs[p.user_id] = p.slug; });

  return NextResponse.json({
    eventTypes: types || [],
    userNameMap,
    bookingPageSlugs,
    currentUserId: user.id,
  });
}

// POST /api/event-types - Create or update event type with slots (service role, bypasses RLS)
export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const serviceClient = createServiceRoleClient();

  // Verify the user is an allowed member
  const { data: userRecord } = await serviceClient
    .from('scheduling_users')
    .select('email')
    .eq('id', user.id)
    .single();

  if (userRecord) {
    const { data: isMember } = await serviceClient
      .from('scheduling_allowed_members')
      .select('id')
      .eq('email', userRecord.email)
      .single();

    if (!isMember) {
      return NextResponse.json({ error: 'Not an allowed member' }, { status: 403 });
    }
  }

  const body = await request.json();
  const { mode, eventTypeId, payload, slots, blockedTimes, attendeeIds } = body;

  let targetId = eventTypeId;

  if (mode === 'edit' && eventTypeId) {
    const { error } = await serviceClient
      .from('scheduling_event_types')
      .update(payload)
      .eq('id', eventTypeId);
    if (error) {
      console.error('Failed to update event type:', error);
      return NextResponse.json({ error: 'Update failed' }, { status: 500 });
    }
  } else {
    const { data: eventType, error } = await serviceClient
      .from('scheduling_event_types')
      .insert(payload)
      .select()
      .single();
    if (error || !eventType) {
      console.error('Failed to create event type:', error);
      return NextResponse.json({ error: 'Create failed' }, { status: 500 });
    }
    targetId = eventType.id;
  }

  if (targetId) {
    // Save slots
    await serviceClient
      .from('scheduling_event_type_slots')
      .delete()
      .eq('event_type_id', targetId);

    if (slots && slots.length > 0) {
      const batchSize = 500;
      for (let i = 0; i < slots.length; i += batchSize) {
        const batch = slots.slice(i, i + batchSize).map((s: { date: string; startTime: string; endTime: string; isAllDay: boolean }) => ({
          event_type_id: targetId,
          date: s.date,
          start_time: s.startTime,
          end_time: s.endTime,
          is_all_day: s.isAllDay || false,
        }));
        const { error: slotsError } = await serviceClient
          .from('scheduling_event_type_slots')
          .insert(batch);
        if (slotsError) console.error('Failed to save slots batch:', slotsError);
      }
    }

    // Save blocked times
    await serviceClient
      .from('scheduling_event_type_blocked_times')
      .delete()
      .eq('event_type_id', targetId);

    if (blockedTimes && blockedTimes.length > 0) {
      const blocksToInsert = blockedTimes.map((b: { date: string; startTime: string; endTime: string }) => ({
        event_type_id: targetId,
        date: b.date,
        start_time: b.startTime,
        end_time: b.endTime,
      }));
      const { error: blockError } = await serviceClient
        .from('scheduling_event_type_blocked_times')
        .insert(blocksToInsert);
      if (blockError) console.error('Failed to save blocked times:', blockError);
    }

    // Save attendees
    await serviceClient
      .from('scheduling_event_type_attendees')
      .delete()
      .eq('event_type_id', targetId);

    if (attendeeIds && attendeeIds.length > 0) {
      const attendeeInserts = attendeeIds.map((uid: string) => ({
        event_type_id: targetId,
        user_id: uid,
      }));
      const { error: attError } = await serviceClient
        .from('scheduling_event_type_attendees')
        .insert(attendeeInserts);
      if (attError) console.error('Failed to save attendees:', attError);
    }
  }

  return NextResponse.json({ success: true, eventTypeId: targetId });
}
