import { createServiceRoleClient, createServerSupabaseClient } from '@/lib/supabase/server';
import { resolveTargetUser } from '@/lib/admin-auth';
import { NextResponse } from 'next/server';

// GET /api/calendar/bookings?weekStart=2024-01-15&weekEnd=2024-01-22
export async function GET(request: Request) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const weekStart = searchParams.get('weekStart');
  const weekEnd = searchParams.get('weekEnd');

  if (!weekStart || !weekEnd) {
    return NextResponse.json({ error: 'weekStart and weekEnd required' }, { status: 400 });
  }

  // Resolve target user (admin proxy support)
  const { userId: targetUserId } = await resolveTargetUser(request, user.id, user.email || '');

  const serviceClient = createServiceRoleClient();

  // Get only allowed members (not all registered users)
  const { data: allowedMembers } = await serviceClient
    .from('scheduling_allowed_members')
    .select('email');

  const allowedEmails = (allowedMembers || []).map(m => m.email).filter(Boolean);

  const { data: allUsers } = await serviceClient
    .from('scheduling_users')
    .select('id, name, email')
    .in('email', allowedEmails.length > 0 ? allowedEmails : ['__none__']);

  const allUserIds = (allUsers || []).map(u => u.id);
  const userNameMap = new Map((allUsers || []).map(u => [u.id, u.name]));

  // Get event types for ALL team members (so we can see each other's reservation links)
  const { data: eventTypes } = await serviceClient
    .from('scheduling_event_types')
    .select('id, name, slug, color, duration_minutes, is_active, user_id')
    .in('user_id', allUserIds.length > 0 ? allUserIds : [targetUserId])
    .order('created_at', { ascending: false });

  // Tag event types with owner name for display
  const enrichedEventTypes = (eventTypes || []).map(et => ({
    ...et,
    owner_name: userNameMap.get(et.user_id) || '',
    is_own: et.user_id === targetUserId,
  }));

  // Get all bookings in the date range for these event types
  const eventTypeIds = (eventTypes || []).map(et => et.id);

  let bookings: Array<{
    id: string;
    event_type_id: string;
    guest_name: string;
    guest_email: string;
    start_time: string;
    end_time: string;
    status: string;
    location_type: string;
    meeting_url: string | null;
  }> = [];

  if (eventTypeIds.length > 0) {
    const { data: bookingsData } = await serviceClient
      .from('scheduling_bookings')
      .select('id, event_type_id, guest_name, guest_email, start_time, end_time, status, location_type, meeting_url')
      .in('event_type_id', eventTypeIds)
      .gte('start_time', weekStart)
      .lt('end_time', weekEnd)
      .neq('status', 'cancelled')
      .order('start_time', { ascending: true });

    bookings = bookingsData || [];
  }

  return NextResponse.json({
    eventTypes: enrichedEventTypes,
    bookings,
  });
}
