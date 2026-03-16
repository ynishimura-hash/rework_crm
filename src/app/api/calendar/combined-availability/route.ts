import { createServiceRoleClient } from '@/lib/supabase/server';
import { getGoogleCalendarEvents } from '@/lib/google-calendar';
import { NextResponse } from 'next/server';
import { startOfDay, endOfDay, parseISO, addMinutes, parse, isAfter, isBefore, areIntervalsOverlapping } from 'date-fns';

// GET /api/calendar/combined-availability?userIds=id1,id2&date=2024-01-15&duration=30
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const userIdsStr = searchParams.get('userIds');
  const dateStr = searchParams.get('date');
  const duration = parseInt(searchParams.get('duration') || '30');

  if (!userIdsStr || !dateStr) {
    return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
  }

  const userIds = userIdsStr.split(',');
  const date = parseISO(dateStr);
  const supabase = createServiceRoleClient();

  const userAvailabilities: Record<string, {
    name: string;
    busySlots: Array<{ start: Date; end: Date }>;
    availableWindows: Array<{ start: string; end: string }>;
  }> = {};

  for (const userId of userIds) {
    const { data: userData } = await supabase
      .from('scheduling_users')
      .select('*')
      .eq('id', userId)
      .single();

    if (!userData) continue;
    const dayOfWeek = date.getDay();
    const { data: rules } = await supabase
      .from('scheduling_availability_rules')
      .select('*')
      .eq('user_id', userId)
      .eq('day_of_week', dayOfWeek);

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

    const overlapEventIds = new Set((overlapSettings || []).map(s => s.google_event_id));
    const busySlots: Array<{ start: Date; end: Date }> = [];

    (bookings || []).forEach(b => {
      busySlots.push({ start: new Date(b.start_time), end: new Date(b.end_time) });
    });

    if (userData.google_access_token && userData.google_refresh_token) {
      try {
        const events = await getGoogleCalendarEvents(
          userData.google_access_token,
          userData.google_refresh_token,
          startOfDay(date).toISOString(),
          endOfDay(date).toISOString(),
          userId
        );
        events
          .filter(e => e.start?.dateTime && e.end?.dateTime)
          .filter(e => !overlapEventIds.has(e.id!))
          .forEach(e => {
            busySlots.push({
              start: new Date(e.start!.dateTime!),
              end: new Date(e.end!.dateTime!),
            });
          });
      } catch (err) {
        console.error(`Failed to fetch calendar for user ${userId}:`, err);
      }
    }
    let availableWindows: Array<{ start: string; end: string }> = [];
    const override = (overrides || []).find(o => o.date === dateStr);

    if (override) {
      if (override.is_blocked) {
        availableWindows = [];
      } else if (override.start_time && override.end_time) {
        availableWindows = [{ start: override.start_time, end: override.end_time }];
      }
    } else {
      availableWindows = (rules || []).map(r => ({ start: r.start_time, end: r.end_time }));
    }

    userAvailabilities[userId] = {
      name: userData.name || userData.email,
      busySlots,
      availableWindows,
    };
  }

  const allWindows = Object.values(userAvailabilities).map(u => u.availableWindows);
  if (allWindows.length === 0 || allWindows.some(w => w.length === 0)) {
    return NextResponse.json({ slots: [], users: userAvailabilities });
  }
  const commonSlots: Array<{ start: string; end: string }> = [];
  let overallStart = '00:00';
  let overallEnd = '23:59';

  for (const windows of allWindows) {
    for (const w of windows) {
      if (w.start > overallStart) overallStart = w.start;
      if (w.end < overallEnd) overallEnd = w.end;
    }
  }

  const windowStart = parse(overallStart, 'HH:mm', date);
  const windowEnd = parse(overallEnd, 'HH:mm', date);
  const now = new Date();

  let slotStart = windowStart;
  while (true) {
    const slotEnd = addMinutes(slotStart, duration);
    if (isAfter(slotEnd, windowEnd)) break;
    if (isBefore(slotStart, now)) {
      slotStart = addMinutes(slotStart, 30);
      continue;
    }

    const slotInterval = { start: slotStart, end: slotEnd };
    const hasConflict = Object.values(userAvailabilities).some(userData =>
      userData.busySlots.some(busy =>
        areIntervalsOverlapping(slotInterval, busy)
      )
    );

    const allUsersAvailable = Object.values(userAvailabilities).every(userData =>
      userData.availableWindows.some(w => {
        const wStart = parse(w.start, 'HH:mm', date);
        const wEnd = parse(w.end, 'HH:mm', date);
        return !isBefore(slotStart, wStart) && !isAfter(slotEnd, wEnd);
      })
    );

    if (!hasConflict && allUsersAvailable) {
      commonSlots.push({
        start: slotStart.toISOString(),
        end: slotEnd.toISOString(),
      });
    }

    slotStart = addMinutes(slotStart, 30);
  }

  const perUser = Object.entries(userAvailabilities).map(([id, data]) => ({
    userId: id,
    name: data.name,
    busySlots: data.busySlots.map(s => ({
      start: s.start.toISOString(),
      end: s.end.toISOString(),
    })),
    availableWindows: data.availableWindows,
  }));

  return NextResponse.json({ commonSlots, perUser });
}