import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

// Helper: check if current user is admin
async function requireAdmin() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Unauthorized', status: 401, user: null };

  const serviceClient = createServiceRoleClient();
  const { data: member } = await serviceClient
    .from('scheduling_allowed_members')
    .select('role')
    .eq('email', user.email)
    .single();

  if (!member || member.role !== 'admin') {
    return { error: 'Forbidden: admin only', status: 403, user: null };
  }
  return { error: null, status: 200, user };
}

// GET /api/members - List all allowed members
export async function GET() {
  const { error, status } = await requireAdmin();
  if (error) return NextResponse.json({ error }, { status });

  const serviceClient = createServiceRoleClient();
  const { data: members } = await serviceClient
    .from('scheduling_allowed_members')
    .select('*')
    .order('created_at', { ascending: true });

  // Enrich with user info if they've joined
  const { data: users } = await serviceClient
    .from('scheduling_users')
    .select('id, email, name, avatar_url');

  const userMap = new Map((users || []).map(u => [u.email, u]));

  const enriched = (members || []).map(m => ({
    ...m,
    user: userMap.get(m.email) || null,
  }));

  return NextResponse.json({ members: enriched });
}

// POST /api/members - Add a new allowed member
export async function POST(request: Request) {
  const { error, status, user } = await requireAdmin();
  if (error) return NextResponse.json({ error }, { status });

  const body = await request.json();
  const { email, role = 'member' } = body;

  if (!email || !email.includes('@')) {
    return NextResponse.json({ error: 'Valid email required' }, { status: 400 });
  }

  const serviceClient = createServiceRoleClient();

  // Check if already exists
  const { data: existing } = await serviceClient
    .from('scheduling_allowed_members')
    .select('id')
    .eq('email', email.toLowerCase())
    .single();

  if (existing) {
    return NextResponse.json({ error: 'このメールアドレスは既に登録されています' }, { status: 409 });
  }

  const { data: member, error: insertError } = await serviceClient
    .from('scheduling_allowed_members')
    .insert({
      email: email.toLowerCase(),
      role,
      invited_by: user!.id,
      permissions: { view: true, edit_own: true, manage_all: false, manage_members: [] },
    })
    .select()
    .single();

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return NextResponse.json({ member });
}

// PUT /api/members - Update member permissions
export async function PUT(request: Request) {
  const { error, status } = await requireAdmin();
  if (error) return NextResponse.json({ error }, { status });

  const body = await request.json();
  const { id, permissions } = body;

  if (!id || !permissions) {
    return NextResponse.json({ error: 'id and permissions required' }, { status: 400 });
  }

  const serviceClient = createServiceRoleClient();

  // Validate permissions shape
  const validPerms = {
    view: permissions.view !== false,
    edit_own: permissions.edit_own !== false,
    manage_all: permissions.manage_all === true,
    manage_members: Array.isArray(permissions.manage_members) ? permissions.manage_members : [],
  };

  const { error: updateError } = await serviceClient
    .from('scheduling_allowed_members')
    .update({ permissions: validPerms })
    .eq('id', id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

// DELETE /api/members?id=xxx - Remove a member
export async function DELETE(request: Request) {
  const { error, status } = await requireAdmin();
  if (error) return NextResponse.json({ error }, { status });

  const { searchParams } = new URL(request.url);
  const memberId = searchParams.get('id');
  if (!memberId) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const serviceClient = createServiceRoleClient();

  // Prevent deleting admin's own record
  const { data: member } = await serviceClient
    .from('scheduling_allowed_members')
    .select('email, role')
    .eq('id', memberId)
    .single();

  if (member?.role === 'admin') {
    return NextResponse.json({ error: '管理者は削除できません' }, { status: 400 });
  }

  await serviceClient
    .from('scheduling_allowed_members')
    .delete()
    .eq('id', memberId);

  return NextResponse.json({ success: true });
}
