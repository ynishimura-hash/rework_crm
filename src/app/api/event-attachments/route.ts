import { NextResponse } from 'next/server';
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server';

// Uses the existing scheduling_comments table with target_type='event_attachment'
// Content stores JSON: { file_url, file_name, file_type, context, description }

interface AttachmentContent {
  file_url: string;
  file_name: string;
  file_type: string;
  context: string;
  description: string | null;
}

function parseAttachment(row: { id: string; user_id: string; target_id: string; content: string; created_at: string }) {
  try {
    const parsed: AttachmentContent = JSON.parse(row.content);
    return {
      id: row.id,
      user_id: row.user_id,
      google_event_id: row.target_id,
      file_url: parsed.file_url,
      file_name: parsed.file_name,
      file_type: parsed.file_type,
      context: parsed.context,
      description: parsed.description,
      created_at: row.created_at,
    };
  } catch {
    return null;
  }
}

// GET /api/event-attachments?eventId=xxx
export async function GET(request: Request) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const eventId = searchParams.get('eventId');
  const type = searchParams.get('type'); // 'meeting_notes' or null (default: event_attachment)

  const targetType = type === 'meeting_notes' ? 'meeting_notes' : 'event_attachment';

  const serviceClient = createServiceRoleClient();
  let query = serviceClient
    .from('scheduling_comments')
    .select('*')
    .eq('target_type', targetType)
    .order('created_at', { ascending: false });

  if (eventId) {
    query = query.eq('target_id', eventId);
  } else {
    query = query.eq('user_id', user.id).limit(50);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const attachments = (data || []).map(parseAttachment).filter(Boolean);
  return NextResponse.json({ attachments });
}

// POST /api/event-attachments
// Body: { eventId?, imageBase64, fileName?, fileType?, context?, description? }
export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const { eventId, imageBase64, fileName, fileType, context, description, type, url } = body;

  const serviceClient = createServiceRoleClient();

  // Handle meeting notes
  if (type === 'meeting_notes') {
    if (!url) {
      return NextResponse.json({ error: 'URLが必要です' }, { status: 400 });
    }
    // Delete existing meeting notes for this event, then insert new one
    await serviceClient
      .from('scheduling_comments')
      .delete()
      .eq('target_type', 'meeting_notes')
      .eq('target_id', eventId || 'no_event');

    const contentJson = JSON.stringify({ url, file_url: url, file_name: 'meeting_notes', file_type: 'text/url', context: 'meeting_notes', description: null });
    const { data, error } = await serviceClient
      .from('scheduling_comments')
      .insert({
        user_id: user.id,
        target_type: 'meeting_notes',
        target_id: eventId || 'no_event',
        content: contentJson,
      })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ attachment: parseAttachment(data) });
  }

  // Handle image attachments
  if (!imageBase64) {
    return NextResponse.json({ error: '画像データが必要です' }, { status: 400 });
  }

  const contentJson: AttachmentContent = {
    file_url: imageBase64,
    file_name: fileName || `image_${Date.now()}`,
    file_type: fileType || 'image/png',
    context: context || 'manual',
    description: description || null,
  };

  const { data, error } = await serviceClient
    .from('scheduling_comments')
    .insert({
      user_id: user.id,
      target_type: 'event_attachment',
      target_id: eventId || 'no_event',
      content: JSON.stringify(contentJson),
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const attachment = parseAttachment(data);
  return NextResponse.json({ attachment });
}

// DELETE /api/event-attachments
// Body: { id }
export async function DELETE(request: Request) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await request.json();
  const serviceClient = createServiceRoleClient();
  const { error } = await serviceClient
    .from('scheduling_comments')
    .delete()
    .eq('id', id)
    .eq('target_type', 'event_attachment');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
