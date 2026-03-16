-- Migration: 01_core.sql
-- Description: Core CRM domain tables for Companies, Contacts, Services, Deals, and Deal_Services

-- Enable uuid-ossp extension if not exists
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Companies Table
CREATE TABLE IF NOT EXISTS public.companies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    industry VARCHAR(100),
    hp_url TEXT,
    summary TEXT,
    tags JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Contacts Table
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
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(email) -- 名寄せ用
);

-- 3. Services Table
CREATE TABLE IF NOT EXISTS public.services (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    base_price INTEGER NOT NULL DEFAULT 0,
    unit VARCHAR(50),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 4. Deals Table
CREATE TABLE IF NOT EXISTS public.deals (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
    contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
    title VARCHAR(255) NOT NULL,
    status VARCHAR(50) DEFAULT '相談受付', -- 相談受付, 企画書送付, 見積送付, 成約, 失注
    estimated_amount INTEGER DEFAULT 0,
    ai_proposal TEXT,
    mf_estimate_id VARCHAR(100),
    close_date DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 5. Deal Services Table (Individual pricing for deals)
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

-- Enable Row Level Security (RLS)
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deal_services ENABLE ROW LEVEL SECURITY;

-- Note: Policies will be added in a separate access control migration if needed,
-- but for now we can create simple authenticated access policies.

CREATE POLICY "Enable read access for authenticated users" ON public.companies FOR SELECT TO authenticated USING (true);
CREATE POLICY "Enable insert access for authenticated users" ON public.companies FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Enable update access for authenticated users" ON public.companies FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Enable read access for authenticated users" ON public.contacts FOR SELECT TO authenticated USING (true);
CREATE POLICY "Enable insert access for authenticated users" ON public.contacts FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Enable update access for authenticated users" ON public.contacts FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Enable read access for authenticated users" ON public.services FOR SELECT TO authenticated USING (true);
CREATE POLICY "Enable insert access for authenticated users" ON public.services FOR SELECT TO authenticated WITH CHECK (true);

CREATE POLICY "Enable read access for authenticated users" ON public.deals FOR SELECT TO authenticated USING (true);
CREATE POLICY "Enable insert access for authenticated users" ON public.deals FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Enable update access for authenticated users" ON public.deals FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Enable read access for authenticated users" ON public.deal_services FOR SELECT TO authenticated USING (true);
CREATE POLICY "Enable insert access for authenticated users" ON public.deal_services FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Enable update access for authenticated users" ON public.deal_services FOR UPDATE TO authenticated USING (true);
