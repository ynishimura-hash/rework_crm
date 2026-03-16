import { createServiceRoleClient } from '@/lib/supabase/server';
import { deleteGoogleCalendarEvent, updateGoogleCalendarEvent } from '@/lib/google-calendar';
import { sendCancellationEmail, sendRescheduleEmail } from '@/lib/email';
import { NextRequest, NextResponse } from 'next/server';

// GET /api/bookings/manage?token=xxx — Get booking details (public)
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token');
  if (!token) return NextResponse.json({ error: 'Missing token' }, { status: 400 });

  const supabase = createServiceRoleClient();
  const { data: booking } = await supabase
    .from('scheduling_bookings')
    .select('*, scheduling_event_types(name, duration_minutes, location_type, offline_location, email_template_id, scheduling_users(name, email))')
    .eq('manage_token', token)
    .single();

  if (!booking) return NextResponse.json({ error: 'Booking not found' }, { status: 404 });

  return NextResponse.json({
    booking: {
      id: booking.id,
      status: booking.status,
      start_time: booking.start_time,
      end_time: booking.end_time,
      guest_name: booking.guest_name,
      guest_email: booking.guest_email,
      location_type: booking.location_type,
      meeting_url: booking.meeting_url,
      event_type_name: booking.scheduling_event_types?.name,
      duration_minutes: booking.scheduling_event_types?.duration_minutes,
      offline_location: booking.scheduling_event_types?.offline_location,
      host_name: booking.scheduling_event_types?.scheduling_users?.name,
    },
  });
}

// POST /api/bookings/manage — Cancel or reschedule (public)
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { token, action, newStartTime, newEndTime } = body;

  if (!token || !action) {
    return NextResponse.json({ error: 'Missing token or action' }, { status: 400 });
  }

  const supabase = createServiceRoleClient();
  const { data: booking } = await supabase
    .from('scheduling_bookings')
    .select('*, scheduling_event_types(name, duration_minutes, location_type, offline_location, email_template_id, user_id, scheduling_users(name, email, google_access_token, google_refresh_token))')
    .eq('manage_token', token)
    .single();

  if (!booking) return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
  if (booking.status === 'cancelled') {
    return NextResponse.json({ error: 'Booking already cancelled' }, { status: 400 });
  }

  const host = booking.scheduling_event_types?.scheduling_users;
  const eventType = booking.scheduling_event_types;

  const emailParams = {
    guestName: booking.guest_name,
    guestEmail: booking.guest_email,
    hostName: host?.name || '',
    hostEmail: host?.email || '',
    hostUserId: eventType?.user_id || booking.host_user_id,
    eventTypeName: eventType?.name || '',
    startTime: booking.start_time,
    endTime: booking.end_time,
    locationType: booking.location_type,
    meetingUrl: booking.meeting_url,
    offlineLocation: eventType?.offline_location,
    manageToken: booking.manage_token,
    templateId: eventType?.email_template_id,
  };

  if (action === 'cancel') {
    // Update booking status
    const { error } = await supabase
      .from('scheduling_bookings')
      .update({ status: 'cancelled' })
      .eq('id', booking.id);

    if (error) return NextResponse.json({ error: 'Failed to cancel' }, { status: 500 });

    // Delete Google Calendar event
    if (booking.google_calendar_event_id && host?.google_access_token && host?.google_refresh_token) {
      try {
        await deleteGoogleCalendarEvent(
          host.google_access_token,
          host.google_refresh_token,
          booking.google_calendar_event_id
        );
      } catch (e) {
        console.error('Failed to delete Google Calendar event:', e);
      }
    }

    // Send cancellation emails
    try {
      await sendCancellationEmail(emailParams);
    } catch (e) {
      console.error('Failed to send cancellation email:', e);
    }

    return NextResponse.json({ success: true });
  }

  if (action === 'reschedule') {
    if (!newStartTime || !newEndTime) {
      return NextResponse.json({ error: 'Missing new times' }, { status: 400 });
    }

    // Update booking times
    const { error } = await supabase
      .from('scheduling_bookings')
      .update({
        start_time: newStartTime,
        end_time: newEndTime,
        status: 'confirmed',
      })
      .eq('id', booking.id);

    if (error) return NextResponse.json({ error: 'Failed to reschedule' }, { status: 500 });

    // Update Google Calendar event
    if (booking.google_calendar_event_id && host?.google_access_token && host?.google_refresh_token) {
      try {
        await updateGoogleCalendarEvent(
          host.google_access_token,
          host.google_refresh_token,
          booking.google_calendar_event_id,
          {
            summary: `${eventType?.name} - ${booking.guest_name}`,
            description: `ゲスト: ${booking.guest_name} (${booking.guest_email})`,
            startTime: newStartTime,
            endTime: newEndTime,
            attendees: [booking.guest_email],
          }
        );
      } catch (e) {
        console.error('Failed to update Google Calendar event:', e);
      }
    }

    // Send reschedule emails with new times
    try {
      await sendRescheduleEmail({
        ...emailParams,
        startTime: newStartTime,
        endTime: newEndTime,
      });
    } catch (e) {
      console.error('Failed to send reschedule email:', e);
    }

    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}
