import { google } from 'googleapis';
import { createServiceRoleClient } from '@/lib/supabase/server';

function createOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/callback`
  );
}

async function getValidClient(accessToken: string, refreshToken: string, userId?: string) {
  const oauth2Client = createOAuth2Client();
  oauth2Client.setCredentials({
    access_token: accessToken,
    refresh_token: refreshToken,
  });

  // Listen for token refresh events
  oauth2Client.on('tokens', async (tokens) => {
    if (userId && tokens.access_token) {
      const supabase = createServiceRoleClient();
      await supabase
        .from('scheduling_users')
        .update({
          google_access_token: tokens.access_token,
          updated_at: new Date().toISOString(),
        })
        .eq('id', userId);
    }
  });

  return google.calendar({ version: 'v3', auth: oauth2Client });
}
export async function getGoogleCalendarEvents(
  accessToken: string,
  refreshToken: string,
  timeMin: string,
  timeMax: string,
  userId?: string
) {
  const calendar = await getValidClient(accessToken, refreshToken, userId);

  const response = await calendar.events.list({
    calendarId: 'primary',
    timeMin,
    timeMax,
    singleEvents: true,
    orderBy: 'startTime',
    fields: 'items(id,summary,description,start,end,location,hangoutLink,conferenceData,htmlLink,attendees,organizer,transparency,recurringEventId,recurrence,attachments)',
  });

  return response.data.items || [];
}

export async function createGoogleCalendarEvent(
  accessToken: string,
  refreshToken: string,
  event: {
    summary: string;
    description?: string;
    startTime: string;
    endTime: string;
    attendeeEmail: string;
    location?: string;
    createMeetLink?: boolean;
    reminderMinutes?: number;
  },
  userId?: string
) {
  const calendar = await getValidClient(accessToken, refreshToken, userId);
  const reminderMin = event.reminderMinutes ?? 10;
  const eventBody: Record<string, unknown> = {
    summary: event.summary,
    description: event.description || '',
    start: { dateTime: event.startTime, timeZone: 'Asia/Tokyo' },
    end: { dateTime: event.endTime, timeZone: 'Asia/Tokyo' },
    attendees: [{ email: event.attendeeEmail }],
    reminders: {
      useDefault: false,
      overrides: [
        { method: 'popup', minutes: reminderMin },
      ],
    },
  };

  if (event.location) eventBody.location = event.location;
  if (event.createMeetLink) {
    eventBody.conferenceData = {
      createRequest: {
        requestId: `booking-${Date.now()}`,
        conferenceSolutionKey: { type: 'hangoutsMeet' },
      },
    };
  }

  const response = await calendar.events.insert({
    calendarId: 'primary',
    requestBody: eventBody,
    conferenceDataVersion: event.createMeetLink ? 1 : 0,
    sendUpdates: 'all',
  });

  return {
    eventId: response.data.id,
    meetLink: response.data.conferenceData?.entryPoints?.[0]?.uri || null,
    htmlLink: response.data.htmlLink,
  };
}

export async function deleteGoogleCalendarEvent(
  accessToken: string,
  refreshToken: string,
  eventId: string,
  userId?: string
) {
  const calendar = await getValidClient(accessToken, refreshToken, userId);
  await calendar.events.delete({
    calendarId: 'primary',
    eventId,
    sendUpdates: 'all',
  });
}

export async function getGoogleCalendarEvent(
  accessToken: string,
  refreshToken: string,
  eventId: string,
  userId?: string
) {
  const calendar = await getValidClient(accessToken, refreshToken, userId);
  const response = await calendar.events.get({
    calendarId: 'primary',
    eventId,
  });
  return response.data;
}

export async function updateGoogleCalendarEvent(
  accessToken: string,
  refreshToken: string,
  eventId: string,
  updates: {
    summary?: string;
    description?: string;
    startTime?: string;
    endTime?: string;
    location?: string;
    attendees?: string[];
    createMeetLink?: boolean;
    transparency?: 'opaque' | 'transparent';
  },
  userId?: string
) {
  const calendar = await getValidClient(accessToken, refreshToken, userId);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const eventBody: Record<string, any> = {};

  if (updates.summary !== undefined) eventBody.summary = updates.summary;
  if (updates.description !== undefined) eventBody.description = updates.description;
  if (updates.startTime) eventBody.start = { dateTime: updates.startTime, timeZone: 'Asia/Tokyo' };
  if (updates.endTime) eventBody.end = { dateTime: updates.endTime, timeZone: 'Asia/Tokyo' };
  if (updates.location !== undefined) eventBody.location = updates.location;
  if (updates.attendees) eventBody.attendees = updates.attendees.map(email => ({ email }));
  if (updates.transparency !== undefined) eventBody.transparency = updates.transparency;

  if (updates.createMeetLink) {
    // Check if event already has conference data
    const existing = await calendar.events.get({ calendarId: 'primary', eventId });
    if (!existing.data.conferenceData) {
      eventBody.conferenceData = {
        createRequest: {
          requestId: `update-${Date.now()}`,
          conferenceSolutionKey: { type: 'hangoutsMeet' },
        },
      };
    }
  }

  const response = await calendar.events.patch({
    calendarId: 'primary',
    eventId,
    requestBody: eventBody,
    conferenceDataVersion: updates.createMeetLink ? 1 : 0,
    sendUpdates: 'all',
  });

  return {
    eventId: response.data.id,
    meetLink: response.data.conferenceData?.entryPoints?.[0]?.uri || null,
    htmlLink: response.data.htmlLink,
  };
}