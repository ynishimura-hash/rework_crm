import { createServiceRoleClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

// GET /api/users - List only users who are registered as allowed members
export async function GET() {
  const supabase = createServiceRoleClient();

  // Get allowed member emails
  const { data: allowedMembers } = await supabase
    .from('scheduling_allowed_members')
    .select('email');

  const allowedEmails = (allowedMembers || []).map(m => m.email).filter(Boolean);

  if (allowedEmails.length === 0) {
    return NextResponse.json({ users: [] });
  }

  // Only return users whose email is in the allowed members list
  const { data: users, error } = await supabase
    .from('scheduling_users')
    .select('id, name, email, avatar_url')
    .in('email', allowedEmails)
    .order('name');

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ users: users || [] });
}
