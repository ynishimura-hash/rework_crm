-- Migration: 07_align_with_lark_excel.sql
-- Description: Excel/Larkデータ構造に合わせたスキーマ拡張

-- 1.1 companies テーブル拡張
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS internal_staff VARCHAR(255);
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS referral_source VARCHAR(255);

-- 1.2 contacts テーブル拡張
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS last_name VARCHAR(100);
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS first_name VARCHAR(100);
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS furigana VARCHAR(255);

-- 1.3 deals テーブル拡張
ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS expected_amount INTEGER DEFAULT 0;
ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS first_appointment_date DATE;
ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS next_appointment_date DATE;
ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS action_plan TEXT;
ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS payment_due_date DATE;
ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS result_date DATE;

-- 1.4 議事録テーブル新規作成
CREATE TABLE IF NOT EXISTS public.meeting_notes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title VARCHAR(255) NOT NULL,
    meeting_date DATE,
    contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
    deal_id UUID REFERENCES public.deals(id) ON DELETE SET NULL,
    note_url TEXT,
    memo TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.meeting_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Enable all access for authenticated users" ON public.meeting_notes
    FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Enable all access for anon users" ON public.meeting_notes
    FOR ALL TO anon USING (true) WITH CHECK (true);

-- 1.5 インデックス
CREATE INDEX IF NOT EXISTS idx_meeting_notes_contact_id ON public.meeting_notes(contact_id);
CREATE INDEX IF NOT EXISTS idx_meeting_notes_deal_id ON public.meeting_notes(deal_id);
CREATE INDEX IF NOT EXISTS idx_deals_next_appointment ON public.deals(next_appointment_date);
CREATE INDEX IF NOT EXISTS idx_deals_payment_due_date ON public.deals(payment_due_date);
CREATE INDEX IF NOT EXISTS idx_contacts_last_name ON public.contacts(last_name);

-- 1.6 Google Calendar同期用テーブル（将来のカレンダー機能用）
CREATE TABLE IF NOT EXISTS public.google_calendar_tokens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_email VARCHAR(255) NOT NULL UNIQUE,
    access_token TEXT,
    refresh_token TEXT,
    token_expiry TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.google_calendar_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Enable all access for authenticated users" ON public.google_calendar_tokens
    FOR ALL TO authenticated USING (true) WITH CHECK (true);
