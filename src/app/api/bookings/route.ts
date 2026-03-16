import { createServiceRoleClient } from '@/lib/supabase/server';
import { createGoogleCalendarEvent } from '@/lib/google-calendar';
import { sendBookingConfirmation } from '@/lib/email';
import { generateManageToken } from '@/lib/tokens';
import { NextResponse } from 'next/server';

// POST /api/bookings - Create a new booking (public endpoint)
export async function POST(request: Request) {
  const body = await request.json();
  const {
    eventTypeId,
    startTime,
    endTime,
    guestName,
    guestEmail,
    guestNotes,
    locationType,
  } = body;

  if (!eventTypeId || !startTime || !endTime || !guestName || !guestEmail) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  const supabase = createServiceRoleClient();

  // Get event type and host info
  const { data: eventType } = await supabase
    .from('scheduling_event_types')
    .select('*, scheduling_users(*)')
    .eq('id', eventTypeId)
    .single();

  if (!eventType) {
    return NextResponse.json({ error: 'Event type not found' }, { status: 404 });
  }

  const host = eventType.scheduling_users;
  let meetingUrl: string | null = null;
  let googleEventId: string | null = null;

  // Create Google Calendar event if host has tokens
  if (host.google_access_token && host.google_refresh_token) {
    try {
      const isOnline = locationType === 'online';
      const result = await createGoogleCalendarEvent(
        host.google_access_token,
        host.google_refresh_token,
        {
          summary: `${eventType.name} - ${guestName}`,
          description: `ゲスト: ${guestName} (${guestEmail})\n${guestNotes || ''}`,
          startTime,
          endTime,
          attendeeEmail: guestEmail,
          location: isOnline ? undefined : eventType.offline_location || undefined,
          createMeetLink: isOnline,
        }
      );
      googleEventId = result.eventId || null;
      meetingUrl = result.meetLink;
    } catch (error) {
      console.error('Failed to create Google Calendar event:', error);
      // Continue without Calendar integration
    }
  }

  // Create booking in database
  const { data: booking, error } = await supabase
    .from('scheduling_bookings')
    .insert({
      event_type_id: eventTypeId,
      host_user_id: eventType.user_id,
      guest_name: guestName,
      guest_email: guestEmail,
      guest_notes: guestNotes || null,
      start_time: startTime,
      end_time: endTime,
      location_type: locationType,
      meeting_url: meetingUrl,
      google_calendar_event_id: googleEventId,
      manage_token: generateManageToken(),
      status: 'confirmed',
    })
    .select()
    .single();

  if (error) {
    console.error('Failed to create booking:', error);
    return NextResponse.json({ error: 'Failed to create booking' }, { status: 500 });
  }

  // Send confirmation emails
  try {
    await sendBookingConfirmation({
      guestName,
      guestEmail,
      hostName: host.name,
      hostEmail: host.email,
      hostUserId: eventType.user_id,
      eventTypeName: eventType.name,
      startTime,
      endTime,
      locationType,
      meetingUrl,
      offlineLocation: eventType.offline_location,
      manageToken: booking.manage_token,
      templateId: eventType.email_template_id,
    });
  } catch (error) {
    console.error('Failed to send confirmation email:', error);
  }

  return NextResponse.json({ booking });
}
