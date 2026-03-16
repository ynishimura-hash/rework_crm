-- ============================================
-- EIS 顧客管理システム - 全マイグレーション結合
-- Supabaseダッシュボード > SQL Editor で実行してください
-- ============================================

-- ===========================================
-- Migration 01: Core CRM Tables
-- ===========================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Companies
CREATE TABLE IF NOT EXISTS public.companies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    industry VARCHAR(100),
    hp_url TEXT,
    summary TEXT,
    tags JSONB DEFAULT '[]'::jsonb,
    status VARCHAR(50) DEFAULT '見込み',
    last_active_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Contacts
CREATE TABLE IF NOT EXISTS public.contacts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    department VARCHAR(255),
    position VARCHAR(255),
    email VARCHAR(255),
    phone VARCHAR(50),
    business_card_url TEXT,
    line_user_id VARCHAR(100),
    priority VARCHAR(20) DEFAULT '中',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Email部分ユニーク制約（NULLと空文字列を除外）
CREATE UNIQUE INDEX IF NOT EXISTS idx_contacts_email_unique
  ON public.contacts (email)
  WHERE email IS NOT NULL AND email != '';

-- Services
CREATE TABLE IF NOT EXISTS public.services (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    base_price INTEGER NOT NULL DEFAULT 0,
    unit VARCHAR(50),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Deals
CREATE TABLE IF NOT EXISTS public.deals (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
    contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
    title VARCHAR(255) NOT NULL,
    status VARCHAR(50) DEFAULT '相談受付',
    estimated_amount INTEGER DEFAULT 0,
    ai_proposal TEXT,
    mf_estimate_id VARCHAR(100),
    freee_invoice_id VARCHAR(255),
    close_date DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Deal Services
CREATE TABLE IF NOT EXISTS public.deal_services (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    deal_id UUID REFERENCES public.deals(id) ON DELETE CASCADE,
    service_id UUID REFERENCES public.services(id) ON DELETE CASCADE,
    custom_price INTEGER NOT NULL,
    quantity INTEGER DEFAULT 1,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ===========================================
-- Migration 02: Tracking Tables
-- ===========================================
CREATE TABLE IF NOT EXISTS public.activities (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
    deal_id UUID REFERENCES public.deals(id) ON DELETE SET NULL,
    title VARCHAR(255) NOT NULL,
    start_time TIMESTAMP WITH TIME ZONE NOT NULL,
    end_time TIMESTAMP WITH TIME ZONE,
    meeting_url TEXT,
    ai_summary TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.activity_participants (
    activity_id UUID REFERENCES public.activities(id) ON DELETE CASCADE,
    contact_id UUID REFERENCES public.contacts(id) ON DELETE CASCADE,
    PRIMARY KEY (activity_id, contact_id)
);

CREATE TABLE IF NOT EXISTS public.communications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    contact_id UUID REFERENCES public.contacts(id) ON DELETE CASCADE,
    channel_type VARCHAR(50) NOT NULL,
    direction VARCHAR(50) NOT NULL,
    content TEXT NOT NULL,
    sent_at TIMESTAMP WITH TIME ZONE NOT NULL,
    is_read BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.files (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title VARCHAR(255) NOT NULL,
    storage_path TEXT NOT NULL,
    file_type VARCHAR(50),
    extracted_text TEXT,
    target_type VARCHAR(50) NOT NULL,
    target_id UUID NOT NULL,
    ai_tags JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_files_target ON public.files(target_type, target_id);

-- ===========================================
-- Migration 03: Integrations Tables
-- ===========================================
CREATE TABLE IF NOT EXISTS public.service_accounts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
    service_name VARCHAR(100) NOT NULL,
    external_tenant_id VARCHAR(255),
    access_token TEXT,
    status VARCHAR(50) DEFAULT 'ACTIVE',
    contract_start TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.projects (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    deal_id UUID REFERENCES public.deals(id) ON DELETE SET NULL,
    title VARCHAR(255) NOT NULL,
    lark_task_id VARCHAR(255),
    status VARCHAR(50) DEFAULT 'ONGOING',
    delivery_date TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.invoices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
    mf_invoice_id VARCHAR(255),
    amount INTEGER NOT NULL DEFAULT 0,
    billing_date DATE,
    due_date DATE,
    payment_status VARCHAR(50) DEFAULT 'UNPAID',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ===========================================
-- RLS (Row Level Security) 設定
-- ===========================================
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deal_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.communications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

-- Companies RLS
CREATE POLICY "companies_select" ON public.companies FOR SELECT TO authenticated USING (true);
CREATE POLICY "companies_insert" ON public.companies FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "companies_update" ON public.companies FOR UPDATE TO authenticated USING (true);
CREATE POLICY "companies_delete" ON public.companies FOR DELETE TO authenticated USING (true);

-- Contacts RLS
CREATE POLICY "contacts_select" ON public.contacts FOR SELECT TO authenticated USING (true);
CREATE POLICY "contacts_insert" ON public.contacts FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "contacts_update" ON public.contacts FOR UPDATE TO authenticated USING (true);
CREATE POLICY "contacts_delete" ON public.contacts FOR DELETE TO authenticated USING (true);

-- Services RLS
CREATE POLICY "services_select" ON public.services FOR SELECT TO authenticated USING (true);
CREATE POLICY "services_insert" ON public.services FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "services_update" ON public.services FOR UPDATE TO authenticated USING (true);

-- Deals RLS
CREATE POLICY "deals_select" ON public.deals FOR SELECT TO authenticated USING (true);
CREATE POLICY "deals_insert" ON public.deals FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "deals_update" ON public.deals FOR UPDATE TO authenticated USING (true);
CREATE POLICY "deals_delete" ON public.deals FOR DELETE TO authenticated USING (true);

-- Deal Services RLS
CREATE POLICY "deal_services_select" ON public.deal_services FOR SELECT TO authenticated USING (true);
CREATE POLICY "deal_services_insert" ON public.deal_services FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "deal_services_update" ON public.deal_services FOR UPDATE TO authenticated USING (true);

-- Tracking tables RLS
CREATE POLICY "activities_all" ON public.activities FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "activity_participants_all" ON public.activity_participants FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "communications_all" ON public.communications FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "files_all" ON public.files FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Integration tables RLS
CREATE POLICY "service_accounts_all" ON public.service_accounts FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "projects_all" ON public.projects FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "invoices_all" ON public.invoices FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ===========================================
-- パフォーマンス用インデックス
-- ===========================================
CREATE INDEX IF NOT EXISTS idx_companies_name ON public.companies(name);
CREATE INDEX IF NOT EXISTS idx_companies_status ON public.companies(status);
CREATE INDEX IF NOT EXISTS idx_contacts_company_id ON public.contacts(company_id);
CREATE INDEX IF NOT EXISTS idx_contacts_name ON public.contacts(name);
CREATE INDEX IF NOT EXISTS idx_deals_company_id ON public.deals(company_id);
CREATE INDEX IF NOT EXISTS idx_deals_contact_id ON public.deals(contact_id);
CREATE INDEX IF NOT EXISTS idx_deals_status ON public.deals(status);
CREATE INDEX IF NOT EXISTS idx_deals_freee_invoice_id ON public.deals(freee_invoice_id);

-- ===========================================
-- シードデータ（テスト用）
-- ===========================================
INSERT INTO public.services (id, name, base_price, unit, is_active)
VALUES
    ('11111111-1111-1111-1111-111111111111', 'Ehime Base 法人プラン', 50000, '月額', true),
    ('22222222-2222-2222-2222-222222222222', 'リクルートサイト動画制作', 300000, '一式', true),
    ('33333333-3333-3333-3333-333333333333', '魅力発見セッション', 100000, '1回', true)
ON CONFLICT (id) DO NOTHING;
