import { createServiceRoleClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import BookingPageClient from './BookingPageClient';

export default async function BookingPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = createServiceRoleClient();

  // Fetch booking page
  const { data: bookingPage } = await supabase
    .from('scheduling_booking_pages')
    .select('*')
    .eq('slug', slug)
    .single();

  if (!bookingPage) {
    notFound();
  }

  // Fetch active event types for this user
  const { data: eventTypes } = await supabase
    .from('scheduling_event_types')
    .select('*')
    .eq('user_id', bookingPage.user_id)
    .eq('is_active', true)
    .order('created_at');

  // Fetch user info
  const { data: hostUser } = await supabase
    .from('scheduling_users')
    .select('id, name, avatar_url')
    .eq('id', bookingPage.user_id)
    .single();

  return (
    <BookingPageClient
      bookingPage={bookingPage}
      eventTypes={eventTypes || []}
      hostUser={hostUser}
    />
  );
}
