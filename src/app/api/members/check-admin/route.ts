import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function GET() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ isAdmin: false });

  const serviceClient = createServiceRoleClient();
  const { data: member } = await serviceClient
    .from('scheduling_allowed_members')
    .select('role')
    .eq('email', user.email)
    .single();

  return NextResponse.json({ isAdmin: member?.role === 'admin' });
}
