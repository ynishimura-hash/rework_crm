import { createServiceRoleClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import BookingPageClient from '../BookingPageClient';

export default async function DirectBookingPage({
  params
}: {
  params: Promise<{ slug: string; eventSlug: string }>
}) {
  const { slug, eventSlug } = await params;
  const supabase = createServiceRoleClient();

  const { data: bookingPage } = await supabase
    .from('scheduling_booking_pages')
    .select('*')
    .eq('slug', slug)
    .single();

  if (!bookingPage) notFound();

  // Get specific event type
  const { data: eventType } = await supabase
    .from('scheduling_event_types')
    .select('*')
    .eq('user_id', bookingPage.user_id)
    .eq('slug', eventSlug)
    .eq('is_active', true)
    .single();

  if (!eventType) notFound();

  const { data: hostUser } = await supabase
    .from('scheduling_users')
    .select('id, name, avatar_url')
    .eq('id', bookingPage.user_id)
    .single();

  // Pass only the specific event type - the client will auto-select it
  return (
    <BookingPageClient
      bookingPage={bookingPage}
      eventTypes={[eventType]}
      hostUser={hostUser}
    />
  );
}
