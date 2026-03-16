import { createServiceRoleClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';
import { parseISO, format, addMinutes, isBefore, isAfter } from 'date-fns';

// GET /api/bookings/manage/slots?token=xxx&date=yyyy-MM-dd — Get available slots for reschedule
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token');
  const date = request.nextUrl.searchParams.get('date');

  if (!token || !date) {
    return NextResponse.json({ error: 'Missing token or date' }, { status: 400 });
  }

  const supabase = createServiceRoleClient();

  // Get booking and event type
  const { data: booking } = await supabase
    .from('scheduling_bookings')
    .select('*, scheduling_event_types(id, duration_minutes, user_id, buffer_before_minutes, buffer_after_minutes)')
    .eq('manage_token', token)
    .single();

  if (!booking) return NextResponse.json({ error: 'Booking not found' }, { status: 404 });

  const eventType = booking.scheduling_event_types;
  if (!eventType) return NextResponse.json({ error: 'Event type not found' }, { status: 404 });

  const duration = eventType.duration_minutes;
  const bufferBefore = eventType.buffer_before_minutes || 0;
  const bufferAfter = eventType.buffer_after_minutes || 0;

  // Get available custom slots for this date
  const { data: customSlots } = await supabase
    .from('scheduling_event_type_slots')
    .select('start_time, end_time, is_all_day')
    .eq('event_type_id', eventType.id)
    .eq('date', date);

  // Get blocked times for this date
  const { data: blockedTimes } = await supabase
    .from('scheduling_event_type_blocked_times')
    .select('start_time, end_time')
    .eq('event_type_id', eventType.id)
    .eq('date', date);

  // Get existing bookings for this date (excluding current booking and cancelled ones)
  const dayStart = `${date}T00:00:00`;
  const dayEnd = `${date}T23:59:59`;
  const { data: existingBookings } = await supabase
    .from('scheduling_bookings')
    .select('start_time, end_time')
    .eq('host_user_id', eventType.user_id)
    .neq('id', booking.id)
    .neq('status', 'cancelled')
    .gte('start_time', dayStart)
    .lte('start_time', dayEnd);

  if (!customSlots || customSlots.length === 0) {
    return NextResponse.json({ slots: [] });
  }

  // Generate available time slots
  const availableSlots: { startTime: string; endTime: string }[] = [];

  for (const slot of customSlots) {
    const slotStart = parseISO(`${date}T${slot.start_time}`);
    const slotEnd = parseISO(`${date}T${slot.end_time}`);

    // Generate slots within this availability window
    let current = slotStart;
    while (true) {
      const slotEndTime = addMinutes(current, duration);
      if (isAfter(slotEndTime, slotEnd)) break;

      // Check if slot conflicts with existing bookings (including buffers)
      const bufferedStart = addMinutes(current, -bufferBefore);
      const bufferedEnd = addMinutes(slotEndTime, bufferAfter);

      const hasConflict = (existingBookings || []).some(b => {
        const bStart = parseISO(b.start_time);
        const bEnd = parseISO(b.end_time);
        return isBefore(bufferedStart, bEnd) && isAfter(bufferedEnd, bStart);
      });

      // Check against blocked times
      const isBlocked = (blockedTimes || []).some(bt => {
        const btStart = parseISO(`${date}T${bt.start_time}`);
        const btEnd = parseISO(`${date}T${bt.end_time}`);
        return isBefore(current, btEnd) && isAfter(slotEndTime, btStart);
      });

      // Don't allow booking in the past
      const isPast = isBefore(current, new Date());

      if (!hasConflict && !isBlocked && !isPast) {
        availableSlots.push({
          startTime: current.toISOString(),
          endTime: slotEndTime.toISOString(),
        });
      }

      current = addMinutes(current, 15); // 15-min increments
    }
  }

  return NextResponse.json({ slots: availableSlots });
}
