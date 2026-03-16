import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

// GET /api/comments?targetType=booking&targetId=xxx
export async function GET(request: Request) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const targetType = searchParams.get('targetType');
  const targetId = searchParams.get('targetId');

  if (!targetType || !targetId) {
    return NextResponse.json({ error: 'targetType and targetId required' }, { status: 400 });
  }

  const serviceClient = createServiceRoleClient();
  const { data: comments, error } = await serviceClient
    .from('scheduling_comments')
    .select('*')
    .eq('target_type', targetType)
    .eq('target_id', targetId)
    .order('created_at', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Fetch user info for comments
  const userIds = [...new Set((comments || []).map(c => c.user_id))];
  let users: { id: string; name: string; email: string; avatar_url: string }[] = [];
  if (userIds.length > 0) {
    const { data } = await serviceClient
      .from('scheduling_users')
      .select('id, name, email, avatar_url')
      .in('id', userIds);
    users = data || [];
  }

  const result = (comments || []).map(c => ({
    ...c,
    user: users.find(u => u.id === c.user_id),
  }));

  return NextResponse.json({ comments: result });
}

// POST /api/comments
export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const { targetType, targetId, content } = body;

  if (!targetType || !targetId || !content?.trim()) {
    return NextResponse.json({ error: 'targetType, targetId, and content required' }, { status: 400 });
  }

  const serviceClient = createServiceRoleClient();
  const { data: comment, error } = await serviceClient
    .from('scheduling_comments')
    .insert({
      user_id: user.id,
      target_type: targetType,
      target_id: targetId,
      content: content.trim(),
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Fetch user info
  const { data: userData } = await serviceClient
    .from('scheduling_users')
    .select('id, name, email, avatar_url')
    .eq('id', user.id)
    .single();

  return NextResponse.json({ comment: { ...comment, user: userData } });
}

// PUT /api/comments
export async function PUT(request: Request) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const { id, content } = body;

  if (!id || !content?.trim()) {
    return NextResponse.json({ error: 'id and content required' }, { status: 400 });
  }

  const serviceClient = createServiceRoleClient();
  const { data: comment, error } = await serviceClient
    .from('scheduling_comments')
    .update({ content: content.trim(), updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', user.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ comment });
}

// DELETE /api/comments?id=xxx
export async function DELETE(request: Request) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const serviceClient = createServiceRoleClient();
  const { error } = await serviceClient
    .from('scheduling_comments')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
