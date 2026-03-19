-- Migration: Gmail + LINE Works 統合のためのスキーマ拡張
-- communications テーブルに列を追加

ALTER TABLE public.communications
  ADD COLUMN IF NOT EXISTS subject TEXT,
  ADD COLUMN IF NOT EXISTS thread_id VARCHAR(255),
  ADD COLUMN IF NOT EXISTS external_message_id VARCHAR(255),
  ADD COLUMN IF NOT EXISTS attachments JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS sender_email VARCHAR(255),
  ADD COLUMN IF NOT EXISTS recipient_email VARCHAR(255);

-- 重複防止用のユニークインデックス
CREATE UNIQUE INDEX IF NOT EXISTS idx_communications_external_message_id
  ON public.communications(external_message_id) WHERE external_message_id IS NOT NULL;

-- 検索用インデックス
CREATE INDEX IF NOT EXISTS idx_communications_thread_id ON public.communications(thread_id);
CREATE INDEX IF NOT EXISTS idx_communications_contact_id ON public.communications(contact_id);
CREATE INDEX IF NOT EXISTS idx_communications_sender_email ON public.communications(sender_email);
CREATE INDEX IF NOT EXISTS idx_communications_channel_type ON public.communications(channel_type);
CREATE INDEX IF NOT EXISTS idx_communications_sent_at ON public.communications(sent_at DESC);

-- Gmail トークンテーブル
CREATE TABLE IF NOT EXISTS public.gmail_tokens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id VARCHAR(255) NOT NULL UNIQUE,
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  expires_at TIMESTAMP WITH TIME ZONE,
  gmail_address VARCHAR(255),
  history_id VARCHAR(100),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- LINE Works トークンテーブル
CREATE TABLE IF NOT EXISTS public.lineworks_tokens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id VARCHAR(255) NOT NULL UNIQUE,
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  expires_at TIMESTAMP WITH TIME ZONE,
  bot_id VARCHAR(255),
  domain_id VARCHAR(255),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- RLS有効化
ALTER TABLE public.gmail_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lineworks_tokens ENABLE ROW LEVEL SECURITY;

-- RLSポリシー
CREATE POLICY "Enable all access for authenticated users" ON public.gmail_tokens FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Enable all access for authenticated users" ON public.lineworks_tokens FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- CRM用メールテンプレートテーブル
CREATE TABLE IF NOT EXISTS public.crm_email_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  subject TEXT NOT NULL,
  body_html TEXT NOT NULL,
  category VARCHAR(50) DEFAULT 'general',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.crm_email_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Enable all access for authenticated users" ON public.crm_email_templates FOR ALL TO authenticated USING (true) WITH CHECK (true);
