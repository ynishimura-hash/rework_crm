import { createServiceRoleClient } from '@/lib/supabase/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getGoogleCalendarEvents, getGoogleCalendarEvent, createGoogleCalendarEvent, updateGoogleCalendarEvent, deleteGoogleCalendarEvent } from '@/lib/google-calendar';
import { resolveTargetUser } from '@/lib/admin-auth';
import { NextResponse } from 'next/server';
import { startOfWeek, endOfWeek, parseISO, addDays } from 'date-fns';

// GET /api/calendar/events?weekStart=2024-01-15
// Also supports: ?startDate=2024-01-10&endDate=2024-02-01 for flexible ranges
export async function GET(request: Request) {
  let authUserId: string;
  let authUserEmail: string;

  // Dev bypass: skip auth in development
  if (process.env.NODE_ENV === 'development' && process.env.DEV_BYPASS_AUTH === 'true' && process.env.DEV_USER_ID) {
    authUserId = process.env.DEV_USER_ID;
    const serviceClient = createServiceRoleClient();
    const { data: devUser } = await serviceClient.from('scheduling_users').select('email').eq('id', authUserId).single();
    authUserEmail = devUser?.email || '';
  } else {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    authUserId = user.id;
    authUserEmail = user.email || '';
  }

  const { searchParams } = new URL(request.url);
  const weekStartStr = searchParams.get('weekStart');
  const startDateStr = searchParams.get('startDate');
  const endDateStr = searchParams.get('endDate');
  const attendeeIdsParam = searchParams.get('attendeeIds'); // comma-separated user IDs

  // Resolve target user (admin proxy support)
  const { userId: targetUserId } = await resolveTargetUser(request, authUserId, authUserEmail);

  let weekStart: Date;
  let weekEnd: Date;
  if (startDateStr && endDateStr) {
    // Flexible date range mode (for prefetching)
    weekStart = parseISO(startDateStr);
    weekEnd = parseISO(endDateStr);
  } else if (weekStartStr) {
    weekStart = parseISO(weekStartStr);
    weekEnd = addDays(weekStart, 7);
  } else {
    weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
    weekEnd = endOfWeek(new Date(), { weekStartsOn: 1 });
  }

  const serviceClient = createServiceRoleClient();

  // Parallel: fetch user tokens + availability rules + attendee tokens at the same time
  const attendeeIds = attendeeIdsParam ? attendeeIdsParam.split(',').filter(id => id && id !== targetUserId) : [];

  const [userResult, rulesResult, attendeesResult] = await Promise.all([
    // 1. User tokens + email in a single query
    serviceClient
      .from('scheduling_users')
      .select('email, google_access_token, google_refresh_token')
      .eq('id', targetUserId)
      .single(),
    // 2. Availability rules
    serviceClient
      .from('scheduling_availability_rules')
      .select('*')
      .eq('user_id', targetUserId),
    // 3. Attendee tokens (batch query instead of N+1)
    attendeeIds.length > 0
      ? serviceClient
          .from('scheduling_users')
          .select('id, name, email, google_access_token, google_refresh_token')
          .in('id', attendeeIds)
      : Promise.resolve({ data: [] as { id: string; name: string; email: string; google_access_token: string; google_refresh_token: string }[] }),
  ]);

  const userData = userResult.data;
  if (!userData?.google_access_token || !userData?.google_refresh_token) {
    return NextResponse.json({ events: [], availabilityWindows: [] });
  }

  const userEmail = userData.email || '';
  const availabilityWindows = (rulesResult.data || []).map(r => ({
    dayOfWeek: r.day_of_week,
    start: r.start_time,
    end: r.end_time,
  }));

  try {
    // Parallel: fetch main user's Google Calendar + all attendee calendars at the same time
    const attendeeUsers = (attendeesResult.data || []).filter(
      a => a.google_access_token && a.google_refresh_token
    );

    const [events, ...attendeeEventResults] = await Promise.all([
      // Main user's calendar
      getGoogleCalendarEvents(
        userData.google_access_token,
        userData.google_refresh_token,
        weekStart.toISOString(),
        weekEnd.toISOString(),
        targetUserId
      ),
      // All attendee calendars in parallel
      ...attendeeUsers.map(a =>
        getGoogleCalendarEvents(
          a.google_access_token,
          a.google_refresh_token,
          weekStart.toISOString(),
          weekEnd.toISOString(),
          a.id
        ).catch(err => {
          console.error(`Failed to fetch attendee ${a.id} calendar:`, err);
          return [] as Awaited<ReturnType<typeof getGoogleCalendarEvents>>;
        })
      ),
    ]);

    // Fetch event settings (needs event IDs from the result above)
    const eventIds = events.map(e => e.id).filter(Boolean) as string[];
    const { data: settings } = await serviceClient
      .from('scheduling_calendar_event_settings')
      .select('*')
      .eq('user_id', targetUserId)
      .in('google_event_id', eventIds.length > 0 ? eventIds : ['__none__']);

    const settingsMap = new Map(
      (settings || []).map(s => [s.google_event_id, s])
    );

    const formatEvent = (e: (typeof events)[0], allDay: boolean) => ({
      id: e.id,
      summary: e.summary || '(タイトルなし)',
      description: e.description || '',
      start: allDay ? e.start!.date! + 'T00:00:00' : e.start!.dateTime!,
      end: allDay ? e.end!.date! + 'T00:00:00' : e.end!.dateTime!,
      location: e.location || '',
      meetLink: e.hangoutLink || e.conferenceData?.entryPoints?.[0]?.uri || '',
      htmlLink: e.htmlLink || '',
      attendees: (e.attendees || []).map(a => a.displayName ? `${a.displayName} <${a.email}>` : a.email).filter(Boolean) as string[],
      allowOverlap: settingsMap.get(e.id!)?.allow_overlap || false,
      allDay,
      isOrganizer: e.organizer?.self === true || e.organizer?.email === userEmail,
      transparency: (e.transparency as 'opaque' | 'transparent') || 'opaque',
      recurringEventId: e.recurringEventId || null,
      // Google Meet auto-generated docs (transcripts, notes) appear as attachments
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      attachments: ((e as any).attachments || []).map((a: { fileUrl?: string; title?: string; mimeType?: string }) => ({
        url: a.fileUrl || '',
        title: a.title || '',
        mimeType: a.mimeType || '',
      })),
    });

    const formattedEvents = events
      .filter(e => e.start?.dateTime && e.end?.dateTime)
      .map(e => formatEvent(e, false));

    const allDayEvents = events
      .filter(e => e.start?.date && !e.start?.dateTime)
      .map(e => formatEvent(e, true));

    // Build attendee events map from parallel results
    const attendeeEvents: Record<string, typeof formattedEvents> = {};
    attendeeUsers.forEach((a, i) => {
      const aEvents = attendeeEventResults[i] || [];
      attendeeEvents[a.id] = aEvents
        .filter(e => e.start?.dateTime && e.end?.dateTime)
        .map(e => ({
          id: e.id,
          summary: e.summary || '予定',
          description: '',
          start: e.start!.dateTime!,
          end: e.end!.dateTime!,
          location: '',
          meetLink: '',
          htmlLink: '',
          attendees: [] as string[],
          allowOverlap: false,
          allDay: false,
          isOrganizer: false,
          transparency: (e.transparency as 'opaque' | 'transparent') || 'opaque',
          recurringEventId: e.recurringEventId || null,
          attachments: [] as Array<{ url: string; title: string; mimeType: string }>,
        }));
    });

    return NextResponse.json({
      events: [...formattedEvents, ...allDayEvents],
      availabilityWindows,
      attendeeEvents,
    });
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error('Failed to fetch calendar events:', errMsg, error);
    return NextResponse.json({
      events: [],
      availabilityWindows: [],
      error: 'Failed to fetch events',
      errorDetail: errMsg,
    }, { status: 200 });
  }
}

// Helper: get user tokens for authenticated requests
async function getUserTokens(supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>) {
  let userId: string;
  let userEmail: string;

  if (process.env.NODE_ENV === 'development' && process.env.DEV_BYPASS_AUTH === 'true' && process.env.DEV_USER_ID) {
    userId = process.env.DEV_USER_ID;
    const sc = createServiceRoleClient();
    const { data: devUser } = await sc.from('scheduling_users').select('email').eq('id', userId).single();
    userEmail = devUser?.email || '';
  } else {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    userId = user.id;
    userEmail = user.email || '';
  }

  const serviceClient = createServiceRoleClient();
  const { data: userData } = await serviceClient
    .from('scheduling_users')
    .select('google_access_token, google_refresh_token')
    .eq('id', userId)
    .single();

  if (!userData?.google_access_token || !userData?.google_refresh_token) return null;

  return {
    userId,
    email: userEmail,
    accessToken: userData.google_access_token,
    refreshToken: userData.google_refresh_token,
  };
}

// POST /api/calendar/events - Create a new Google Calendar event
export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const tokens = await getUserTokens(supabase);
  if (!tokens) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { summary, description, startTime, endTime, locationType, location, attendees, reminderMinutes } = await request.json();

    if (!summary || !startTime || !endTime) {
      return NextResponse.json({ error: 'Missing required fields: summary, startTime, endTime' }, { status: 400 });
    }

    const result = await createGoogleCalendarEvent(
      tokens.accessToken,
      tokens.refreshToken,
      {
        summary,
        description: description || '',
        startTime,
        endTime,
        attendeeEmail: attendees?.[0] || tokens.email,
        location: locationType === 'offline' ? (location || '') : undefined,
        createMeetLink: locationType === 'online',
        reminderMinutes: reminderMinutes ?? 10,
      },
      tokens.userId
    );

    return NextResponse.json({ event: result });
  } catch (error) {
    console.error('Failed to create calendar event:', error);
    return NextResponse.json({ error: 'Failed to create event' }, { status: 500 });
  }
}

// PUT /api/calendar/events - Update an existing Google Calendar event
// If the user is not the organizer, attempts to use the organizer's credentials
// to update the event (so it updates for all attendees and sends notifications).
export async function PUT(request: Request) {
  const supabase = await createServerSupabaseClient();
  const tokens = await getUserTokens(supabase);
  if (!tokens) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { eventId, summary, description, startTime, endTime, location, locationType, attendees, transparency } = await request.json();

    if (!eventId) {
      return NextResponse.json({ error: 'Missing required field: eventId' }, { status: 400 });
    }

    const updates: Parameters<typeof updateGoogleCalendarEvent>[3] = {};
    if (summary !== undefined) updates.summary = summary;
    if (description !== undefined) updates.description = description;
    if (startTime) updates.startTime = startTime;
    if (endTime) updates.endTime = endTime;
    if (location !== undefined) updates.location = location;
    if (attendees) updates.attendees = attendees;
    if (locationType === 'online') updates.createMeetLink = true;
    if (transparency !== undefined) updates.transparency = transparency;

    console.log('[PUT /api/calendar/events] Updating:', { eventId, startTime, endTime, summary });

    // First, try to get the event to check organizer
    let useAccessToken = tokens.accessToken;
    let useRefreshToken = tokens.refreshToken;
    let useUserId = tokens.userId;

    try {
      const eventData = await getGoogleCalendarEvent(tokens.accessToken, tokens.refreshToken, eventId, tokens.userId);
      const organizerEmail = eventData.organizer?.email;
      const isOrganizer = eventData.organizer?.self === true || organizerEmail === tokens.email;

      if (!isOrganizer && organizerEmail) {
        // Find the organizer in our system and use their credentials
        const serviceClient = createServiceRoleClient();
        const { data: organizerUser } = await serviceClient
          .from('scheduling_users')
          .select('id, google_access_token, google_refresh_token')
          .eq('email', organizerEmail)
          .single();

        if (organizerUser?.google_access_token && organizerUser?.google_refresh_token) {
          console.log('[PUT /api/calendar/events] Using organizer credentials for:', organizerEmail);
          useAccessToken = organizerUser.google_access_token;
          useRefreshToken = organizerUser.google_refresh_token;
          useUserId = organizerUser.id;
        } else {
          console.log('[PUT /api/calendar/events] Organizer not in system, trying with current user credentials');
        }
      }
    } catch (err) {
      console.log('[PUT /api/calendar/events] Could not fetch event details, proceeding with current user:', err);
    }

    const result = await updateGoogleCalendarEvent(
      useAccessToken,
      useRefreshToken,
      eventId,
      updates,
      useUserId
    );

    console.log('[PUT /api/calendar/events] Success:', result.eventId);
    return NextResponse.json({ event: result });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error('[PUT /api/calendar/events] Failed:', errMsg, error);
    return NextResponse.json({ error: 'Failed to update event', detail: errMsg }, { status: 500 });
  }
}

// DELETE /api/calendar/events - Delete a Google Calendar event
export async function DELETE(request: Request) {
  const supabase = await createServerSupabaseClient();
  const tokens = await getUserTokens(supabase);
  if (!tokens) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { eventId } = await request.json();

    if (!eventId) {
      return NextResponse.json({ error: 'Missing required field: eventId' }, { status: 400 });
    }

    await deleteGoogleCalendarEvent(
      tokens.accessToken,
      tokens.refreshToken,
      eventId,
      tokens.userId
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete calendar event:', error);
    return NextResponse.json({ error: 'Failed to delete event' }, { status: 500 });
  }
}