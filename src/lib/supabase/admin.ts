import { createClient } from '@supabase/supabase-js'

// Service Roleキーを使用するAdmin用クライアント
// Server Actions内でのCRUD操作に使用（RLSバイパス）
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}
