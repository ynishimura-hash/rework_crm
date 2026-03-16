import { addMinutes, format, parse, isBefore, isAfter, areIntervalsOverlapping } from 'date-fns';

import type { AvailabilityRule, AvailabilityOverride, Booking, TimeSlot } from '@/types';

interface GoogleCalendarEvent {
  id?: string;
  start: string;
  end: string;
  transparency?: 'opaque' | 'transparent';
}

interface GetAvailableSlotsParams {
  date: Date;
  durationMinutes: number;
  bufferBeforeMinutes: number;
  bufferAfterMinutes: number;
  availabilityRules: AvailabilityRule[];
  availabilityOverrides: AvailabilityOverride[];
  existingBookings: Booking[];
  googleCalendarEvents?: GoogleCalendarEvent[];
  overlapAllowedEventIds?: Set<string>;
}

export function getAvailableSlots({
  date,
  durationMinutes,
  bufferBeforeMinutes,
  bufferAfterMinutes,
  availabilityRules,
  availabilityOverrides,
  existingBookings,
  googleCalendarEvents = [],
  overlapAllowedEventIds = new Set(),
}: GetAvailableSlotsParams): TimeSlot[] {  const dayOfWeek = date.getDay();
  const dateStr = format(date, 'yyyy-MM-dd');

  // Check for overrides on this date
  const override = availabilityOverrides.find(o => o.date === dateStr);

  let timeWindows: Array<{ start: string; end: string }> = [];

  if (override) {
    if (override.is_blocked) {
      return []; // Day is blocked
    }
    if (override.start_time && override.end_time) {
      timeWindows = [{ start: override.start_time, end: override.end_time }];
    }
  } else {
    // Use regular availability rules
    const rules = availabilityRules.filter(r => r.day_of_week === dayOfWeek);
    timeWindows = rules.map(r => ({ start: r.start_time, end: r.end_time }));
  }

  if (timeWindows.length === 0) return [];

  // Generate all possible 30-min slots
  const slots: TimeSlot[] = [];

  for (const window of timeWindows) {
    // Handle both 'HH:mm' and 'HH:mm:ss' formats from database
    const startTimeStr = window.start.substring(0, 5);
    const endTimeStr = window.end.substring(0, 5);
    const windowStart = parse(startTimeStr, 'HH:mm', date);
    const windowEnd = parse(endTimeStr, 'HH:mm', date);
    let slotStart = windowStart;

    while (true) {
      const slotEnd = addMinutes(slotStart, durationMinutes);

      // Check if slot fits within the window
      if (isAfter(slotEnd, windowEnd)) break;

      // Calculate buffered interval
      const bufferedStart = addMinutes(slotStart, -bufferBeforeMinutes);
      const bufferedEnd = addMinutes(slotEnd, bufferAfterMinutes);

      const slotInterval = {
        start: bufferedStart,
        end: bufferedEnd,
      };

      // Check against existing bookings
      const hasBookingConflict = existingBookings.some(booking => {
        if (booking.status === 'cancelled') return false;
        const bookingInterval = {
          start: new Date(booking.start_time),
          end: new Date(booking.end_time),
        };
        return areIntervalsOverlapping(slotInterval, bookingInterval);
      });

      // Check against Google Calendar events (skip overlap-allowed and transparent events)
      const hasCalendarConflict = googleCalendarEvents.some(event => {
        if (event.id && overlapAllowedEventIds.has(event.id)) {
          return false; // Skip events marked as overlap-allowed
        }
        if (event.transparency === 'transparent') {
          return false; // Skip "free" events (予定なし)
        }
        const eventInterval = {
          start: new Date(event.start),
          end: new Date(event.end),
        };
        return areIntervalsOverlapping(slotInterval, eventInterval);
      });
      // Skip past slots
      const now = new Date();
      const isPast = isBefore(slotStart, now);

      if (!hasBookingConflict && !hasCalendarConflict && !isPast) {
        slots.push({
          start: slotStart.toISOString(),
          end: slotEnd.toISOString(),
        });
      }

      slotStart = addMinutes(slotStart, 30); // 30-min increments
    }
  }

  return slots;
}