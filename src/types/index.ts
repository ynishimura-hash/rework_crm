export interface User {
  id: string;
  email: string;
  name: string;
  avatar_url: string | null;
  google_access_token: string | null;
  google_refresh_token: string | null;
  created_at: string;
  updated_at: string;
}

export interface EventType {
  id: string;
  user_id: string;
  name: string;
  slug: string;
  description: string | null;
  duration_minutes: number;
  location_type: 'online' | 'offline' | 'both';
  online_meeting_url: string | null;
  offline_location: string | null;
  buffer_before_minutes: number;
  buffer_after_minutes: number;
  color: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface AvailabilityRule {
  id: string;
  user_id: string;
  day_of_week: number; // 0=Sunday, 6=Saturday
  start_time: string; // "09:00"
  end_time: string;   // "17:00"
  created_at: string;
}

export interface AvailabilityOverride {
  id: string;
  user_id: string;
  date: string; // "2024-01-15"
  start_time: string | null;
  end_time: string | null;
  is_blocked: boolean;
  created_at: string;
}

export interface Booking {
  id: string;
  event_type_id: string;
  host_user_id: string;
  guest_name: string;
  guest_email: string;
  guest_notes: string | null;
  start_time: string;
  end_time: string;
  location_type: 'online' | 'offline';
  meeting_url: string | null;
  google_calendar_event_id: string | null;
  status: 'confirmed' | 'cancelled' | 'completed';
  manage_token: string | null;
  reminder_sent: boolean;
  created_at: string;
  updated_at: string;
  // Joined fields
  event_type?: EventType;
  scheduling_event_types?: EventType;
  host_user?: User;
  scheduling_users?: User;
}

export interface BookingPage {
  id: string;
  user_id: string;
  slug: string;
  company_name: string | null;
  logo_url: string | null;
  primary_color: string;
  welcome_message: string | null;
  created_at: string;
  updated_at: string;
}

export interface TimeSlot {
  start: string;
  end: string;
}

export type EmailTemplateType = 'confirmation' | 'cancellation' | 'reschedule' | 'reminder';

export interface EmailTemplate {
  id: string;
  user_id: string;
  name: string;
  type: EmailTemplateType;
  subject: string;
  body_html: string;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}
