import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server';
import { DEFAULT_TEMPLATES } from '@/lib/email-templates';
import type { EmailTemplateType } from '@/types';
import { resolveTargetUser } from '@/lib/admin-auth';

export async function GET(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const targetUserId = (await resolveTargetUser(request, user.id, user.email || '')).userId;
  const typeFilter = request.nextUrl.searchParams.get('type');

  const serviceClient = createServiceRoleClient();

  // Check if user has templates, auto-create defaults if not
  const { count } = await serviceClient
    .from('scheduling_email_templates')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', targetUserId);

  if (count === 0) {
    const defaults = (Object.entries(DEFAULT_TEMPLATES) as [EmailTemplateType, typeof DEFAULT_TEMPLATES[EmailTemplateType]][]).map(
      ([type, tmpl]) => ({
        user_id: targetUserId,
        name: tmpl.name,
        type,
        subject: tmpl.subject,
        body_html: tmpl.body_html,
        is_default: true,
      })
    );
    await serviceClient.from('scheduling_email_templates').insert(defaults);
  }

  let query = serviceClient
    .from('scheduling_email_templates')
    .select('*')
    .eq('user_id', targetUserId)
    .order('type')
    .order('is_default', { ascending: false })
    .order('created_at');

  if (typeFilter) {
    query = query.eq('type', typeFilter);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ templates: data });
}

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const targetUserId = (await resolveTargetUser(request, user.id, user.email || '')).userId;
  const body = await request.json();

  const serviceClient = createServiceRoleClient();
  const { data, error } = await serviceClient
    .from('scheduling_email_templates')
    .insert({
      user_id: targetUserId,
      name: body.name,
      type: body.type,
      subject: body.subject,
      body_html: body.body_html,
      is_default: false,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ template: data });
}

export async function PATCH(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const targetUserId = (await resolveTargetUser(request, user.id, user.email || '')).userId;
  const body = await request.json();

  if (!body.id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  const serviceClient = createServiceRoleClient();
  const { data, error } = await serviceClient
    .from('scheduling_email_templates')
    .update({
      name: body.name,
      subject: body.subject,
      body_html: body.body_html,
      updated_at: new Date().toISOString(),
    })
    .eq('id', body.id)
    .eq('user_id', targetUserId)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ template: data });
}

export async function DELETE(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const targetUserId = (await resolveTargetUser(request, user.id, user.email || '')).userId;
  const { searchParams } = request.nextUrl;
  const id = searchParams.get('id');

  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  const serviceClient = createServiceRoleClient();

  // Prevent deleting default templates
  const { data: tmpl } = await serviceClient
    .from('scheduling_email_templates')
    .select('is_default')
    .eq('id', id)
    .eq('user_id', targetUserId)
    .single();

  if (!tmpl) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (tmpl.is_default) return NextResponse.json({ error: 'デフォルトテンプレートは削除できません' }, { status: 400 });

  const { error } = await serviceClient
    .from('scheduling_email_templates')
    .delete()
    .eq('id', id)
    .eq('user_id', targetUserId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
