-- Migration: 06_activity_logs.sql
-- Description: 全アクションを記録する活動ログテーブル

CREATE TABLE IF NOT EXISTS public.activity_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    action_type VARCHAR(100) NOT NULL, -- deal_created, invoice_created, quotation_created, payment_confirmed, company_created, deal_updated, freee_synced, freee_unlinked 等
    description TEXT NOT NULL,
    related_deal_id UUID REFERENCES public.deals(id) ON DELETE SET NULL,
    related_company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- RLS有効化
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

-- 認証済みユーザーへのアクセスポリシー
CREATE POLICY "Enable read access for authenticated users" ON public.activity_logs FOR SELECT TO authenticated USING (true);
CREATE POLICY "Enable insert access for authenticated users" ON public.activity_logs FOR INSERT TO authenticated WITH CHECK (true);

-- anonユーザーへのアクセスポリシー（admin clientで使用）
CREATE POLICY "Enable read access for anon" ON public.activity_logs FOR SELECT TO anon USING (true);
CREATE POLICY "Enable insert access for anon" ON public.activity_logs FOR INSERT TO anon WITH CHECK (true);

-- インデックス（action_typeでのフィルタリング高速化）
CREATE INDEX IF NOT EXISTS idx_activity_logs_action_type ON public.activity_logs(action_type);
CREATE INDEX IF NOT EXISTS idx_activity_logs_created_at ON public.activity_logs(created_at DESC);
