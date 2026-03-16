import { createServiceRoleClient } from '@/lib/supabase/server';
import { getAvailableSlots } from '@/lib/availability';
import { getGoogleCalendarEvents } from '@/lib/google-calendar';
import { startOfDay, endOfDay, parseISO, parse, addMinutes, isBefore, isAfter, areIntervalsOverlapping, format } from 'date-fns';
import { NextResponse } from 'next/server';

// GET /api/availability?userId=xxx&eventTypeId=xxx&date=2024-01-15
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get('userId');
  const eventTypeId = searchParams.get('eventTypeId');
  const dateStr = searchParams.get('date');

  if (!userId || !eventTypeId || !dateStr) {
    return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
  }

  const supabase = createServiceRoleClient();
  const date = parseISO(dateStr);

  // Fetch event type
  const { data: eventType } = await supabase
    .from('scheduling_event_types')
    .select('*')
    .eq('id', eventTypeId)
    .single();

  if (!eventType) {
    return NextResponse.json({ error: 'Event type not found' }, { status: 404 });
  }
  // If event type uses custom slots, return those directly
  if (eventType.use_custom_slots) {
    const { data: customSlots } = await supabase
      .from('scheduling_event_type_slots')
      .select('*')
      .eq('event_type_id', eventTypeId)
      .eq('date', dateStr)
      .order('start_time');

    if (!customSlots || customSlots.length === 0) {
      return NextResponse.json({ slots: [] });
    }

    // Fetch existing bookings to filter out booked slots
    const { data: bookings } = await supabase
      .from('scheduling_bookings')
      .select('*')
      .eq('host_user_id', userId)
      .gte('start_time', startOfDay(date).toISOString())
      .lte('start_time', endOfDay(date).toISOString())
      .neq('status', 'cancelled');

    const now = new Date();
    // Parse date as JST midnight to avoid timezone offset issues
    // Slot times (e.g., "09:00:00") are stored as JST local times
    const jstDateStr = `${dateStr}T00:00:00+09:00`;
    const jstDate = new Date(jstDateStr);

    const slots = customSlots
      .filter(cs => {
        const [h, m] = cs.start_time.split(':').map(Number);
        const slotStart = new Date(jstDate.getTime() + h * 3600000 + m * 60000);
        if (isBefore(slotStart, now)) return false;
        return true;
      })
      .flatMap(cs => {
        const [sh, sm] = cs.start_time.split(':').map(Number);
        const [eh, em] = cs.end_time.split(':').map(Number);
        const slotStart = new Date(jstDate.getTime() + sh * 3600000 + sm * 60000);
        const slotEnd = new Date(jstDate.getTime() + eh * 3600000 + em * 60000);
        const subSlots: Array<{ start: string; end: string }> = [];
        let current = slotStart;

        while (true) {
          const end = addMinutes(current, eventType.duration_minutes);
          if (isAfter(end, slotEnd)) break;

          const hasBookingConflict = (bookings || []).some(b => {
            return areIntervalsOverlapping(
              { start: current, end },
              { start: new Date(b.start_time), end: new Date(b.end_time) }
            );
          });

          if (!hasBookingConflict && !isBefore(current, now)) {
            subSlots.push({
              start: current.toISOString(),
              end: end.toISOString(),
            });
          }
          current = addMinutes(current, 30);
        }
        return subSlots;
      });

    return NextResponse.json({ slots });
  }
  // Fallback: use standard availability rules
  const { data: rules } = await supabase
    .from('scheduling_availability_rules')
    .select('*')
    .eq('user_id', userId);

  const { data: overrides } = await supabase
    .from('scheduling_availability_overrides')
    .select('*')
    .eq('user_id', userId)
    .eq('date', dateStr);

  const { data: bookings } = await supabase
    .from('scheduling_bookings')
    .select('*')
    .eq('host_user_id', userId)
    .gte('start_time', startOfDay(date).toISOString())
    .lte('start_time', endOfDay(date).toISOString())
    .neq('status', 'cancelled');

  const { data: overlapSettings } = await supabase
    .from('scheduling_calendar_event_settings')
    .select('google_event_id')
    .eq('user_id', userId)
    .eq('allow_overlap', true);

  const overlapAllowedEventIds = new Set(
    (overlapSettings || []).map(s => s.google_event_id)
  );
  let googleEvents: Array<{ id?: string; start: string; end: string; transparency?: 'opaque' | 'transparent' }> = [];
  const { data: user } = await supabase
    .from('scheduling_users')
    .select('google_access_token, google_refresh_token')
    .eq('id', userId)
    .single();

  if (user?.google_access_token && user?.google_refresh_token) {
    try {
      const events = await getGoogleCalendarEvents(
        user.google_access_token,
        user.google_refresh_token,
        startOfDay(date).toISOString(),
        endOfDay(date).toISOString(),
        userId
      );
      googleEvents = events
        .filter(e => e.start?.dateTime && e.end?.dateTime)
        .map(e => ({
          id: e.id || undefined,
          start: e.start!.dateTime!,
          end: e.end!.dateTime!,
          transparency: (e.transparency as 'opaque' | 'transparent') || 'opaque',
        }));
    } catch (error) {
      console.error('Failed to fetch Google Calendar events:', error);
    }
  }

  const slots = getAvailableSlots({
    date,
    durationMinutes: eventType.duration_minutes,
    bufferBeforeMinutes: eventType.buffer_before_minutes,
    bufferAfterMinutes: eventType.buffer_after_minutes,
    availabilityRules: rules || [],
    availabilityOverrides: overrides || [],
    existingBookings: bookings || [],
    googleCalendarEvents: googleEvents,
    overlapAllowedEventIds,
  });

  return NextResponse.json({ slots });
}