import { createServiceRoleClient } from '@/lib/supabase/server';

export async function resolveTargetUser(
  request: Request,
  currentUserId: string,
  currentUserEmail: string
): Promise<{ userId: string; isProxy: boolean; error?: string }> {
  const { searchParams } = new URL(request.url);
  const targetUserId = searchParams.get('targetUserId');

  if (!targetUserId || targetUserId === currentUserId) {
    return { userId: currentUserId, isProxy: false };
  }

  // Verify current user is admin
  const serviceClient = createServiceRoleClient();
  const { data: member } = await serviceClient
    .from('scheduling_allowed_members')
    .select('role')
    .eq('email', currentUserEmail)
    .single();

  if (member?.role !== 'admin') {
    return { userId: currentUserId, isProxy: false, error: 'Not admin' };
  }

  return { userId: targetUserId, isProxy: true };
}
