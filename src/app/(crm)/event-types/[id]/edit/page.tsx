'use client';

import { useEffect, useState, Suspense } from 'react';
import { useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useManagedUser } from '@/lib/use-managed-user';
import EventTypeEditor from '@/components/event-type-editor/EventTypeEditor';

interface FormData {
  name: string; slug: string; description: string;
  duration_minutes: number; location_type: 'online' | 'offline' | 'both';
  offline_location: string; buffer_before_minutes: number;
  buffer_after_minutes: number; color: string;
  email_template_id: string | null;
}
interface SlotData { date: string; startTime: string; endTime: string; isAllDay: boolean; }
interface BlockedData { date: string; startTime: string; endTime: string; }

function EditEventTypePageContent() {
  const params = useParams();
  const eventTypeId = params.id as string;
  const supabase = createClient();
  const managedUserId = useManagedUser();
  const [loading, setLoading] = useState(true);
  const [initialForm, setInitialForm] = useState<FormData | null>(null);
  const [initialSlots, setInitialSlots] = useState<SlotData[]>([]);
  const [initialBlockedTimes, setInitialBlockedTimes] = useState<BlockedData[]>([]);
  const [initialAttendeeIds, setInitialAttendeeIds] = useState<string[]>([]);
  const [initialBusinessHours, setInitialBusinessHours] = useState<{ start: string; end: string } | undefined>();
  const [initialBreakTimes, setInitialBreakTimes] = useState<{ startTime: string; endTime: string }[] | undefined>();
  const [initialDaySchedules, setInitialDaySchedules] = useState<Record<string, Array<{start: string; end: string}>> | undefined>();
  const [initialBookingStartOffsetDays, setInitialBookingStartOffsetDays] = useState<number | undefined>();
  const [initialBookingEndType, setInitialBookingEndType] = useState<string | undefined>();
  const [initialBookingEndValue, setInitialBookingEndValue] = useState<string | undefined>();
  // The event type owner's user_id - used to show their calendar
  const [eventTypeOwnerId, setEventTypeOwnerId] = useState<string | null>(null);

  useEffect(() => {
    async function loadData() {
      const { data: et } = await supabase
        .from('scheduling_event_types')
        .select('*')
        .eq('id', eventTypeId)
        .single();

      if (et) {
        // Use the event type's owner as the target user for calendar display
        setEventTypeOwnerId(et.user_id);
        setInitialForm({
          name: et.name, slug: et.slug,
          description: et.description || '',
          duration_minutes: et.duration_minutes,
          location_type: et.location_type,
          offline_location: et.offline_location || '',
          buffer_before_minutes: et.buffer_before_minutes,
          buffer_after_minutes: et.buffer_after_minutes,
          color: et.color,
          email_template_id: et.email_template_id || null,
        });
        if (et.business_hours_start || et.business_hours_end) {
          setInitialBusinessHours({
            start: (et.business_hours_start || '09:00').slice(0, 5),
            end: (et.business_hours_end || '18:00').slice(0, 5),
          });
        }
        if (et.break_times && Array.isArray(et.break_times)) {
          setInitialBreakTimes(
            (et.break_times as Array<{ start_time: string; end_time: string }>).map(bt => ({
              startTime: bt.start_time.slice(0, 5),
              endTime: bt.end_time.slice(0, 5),
            }))
          );
        }
        if (et.day_schedules) {
          setInitialDaySchedules(et.day_schedules as Record<string, Array<{start: string; end: string}>>);
        }
        if (et.booking_start_offset_days !== undefined && et.booking_start_offset_days !== null) {
          setInitialBookingStartOffsetDays(et.booking_start_offset_days as number);
        }
        if (et.booking_end_type) {
          setInitialBookingEndType(et.booking_end_type as string);
        }
        if (et.booking_end_value) {
          setInitialBookingEndValue(et.booking_end_value as string);
        }
      }

      const { data: slots } = await supabase
        .from('scheduling_event_type_slots')
        .select('*')
        .eq('event_type_id', eventTypeId);

      if (slots) {
        setInitialSlots(slots.map((s: Record<string, string | boolean>) => ({
          date: s.date as string,
          startTime: (s.start_time as string).slice(0, 5),
          endTime: (s.end_time as string).slice(0, 5),
          isAllDay: s.is_all_day as boolean,
        })));
      }

      const { data: blocked } = await supabase
        .from('scheduling_event_type_blocked_times')
        .select('*')
        .eq('event_type_id', eventTypeId);

      if (blocked) {
        setInitialBlockedTimes(blocked.map((b: Record<string, string>) => ({
          date: b.date,
          startTime: b.start_time.slice(0, 5),
          endTime: b.end_time.slice(0, 5),
        })));
      }

      // Load attendees
      const { data: attendees } = await supabase
        .from('scheduling_event_type_attendees')
        .select('user_id')
        .eq('event_type_id', eventTypeId);

      if (attendees) {
        setInitialAttendeeIds(attendees.map((a: Record<string, string>) => a.user_id));
      }

      setLoading(false);
    }
    loadData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventTypeId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-8rem)]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <EventTypeEditor
      mode="edit"
      eventTypeId={eventTypeId}
      initialForm={initialForm || undefined}
      initialSlots={initialSlots}
      initialBlockedTimes={initialBlockedTimes}
      initialAttendeeIds={initialAttendeeIds}
      managedUserId={eventTypeOwnerId || managedUserId}
      initialBusinessHours={initialBusinessHours}
      initialBreakTimes={initialBreakTimes}
      initialDaySchedules={initialDaySchedules}
      initialBookingStartOffsetDays={initialBookingStartOffsetDays}
      initialBookingEndType={initialBookingEndType}
      initialBookingEndValue={initialBookingEndValue}
    />
  );
}

export default function EditEventTypePage() {
  return (
    <Suspense fallback={<div className="flex justify-center items-center h-64">読み込み中...</div>}>
      <EditEventTypePageContent />
    </Suspense>
  );
}
