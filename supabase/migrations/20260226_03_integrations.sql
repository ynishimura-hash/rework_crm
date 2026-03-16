-- Migration: 03_integrations.sql
-- Description: External services integration tables for Service_Accounts (Ehime Base), Projects (Lark), Invoices (MF/Iyo Bank)

-- 1. Service Accounts Table (Single Sign-On & Integration with other EIS services like Ehime Base)
CREATE TABLE IF NOT EXISTS public.service_accounts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
    service_name VARCHAR(100) NOT NULL, -- e.g., 'EHIME_BASE', 'OTHER_EIS_SERVICES'
    external_tenant_id VARCHAR(255), -- ID in the external system
    access_token TEXT, -- Encrypted token for API access if needed
    status VARCHAR(50) DEFAULT 'ACTIVE', -- 'ACTIVE', 'CANCELLED'
    contract_start TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Projects Table (Post-deal delivery phase, synced with Lark)
CREATE TABLE IF NOT EXISTS public.projects (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    deal_id UUID REFERENCES public.deals(id) ON DELETE SET NULL, -- 1 to 1 relation with deals usually
    title VARCHAR(255) NOT NULL,
    lark_task_id VARCHAR(255), -- Sync key with Lark
    status VARCHAR(50) DEFAULT 'ONGOING', -- 'ONGOING', 'DELIVERED'
    delivery_date TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. Invoices Table (Synced with MoneyForward and Iyo Bank)
CREATE TABLE IF NOT EXISTS public.invoices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
    mf_invoice_id VARCHAR(255), -- ID in MoneyForward
    amount INTEGER NOT NULL DEFAULT 0,
    billing_date DATE,
    due_date DATE,
    payment_status VARCHAR(50) DEFAULT 'UNPAID', -- 'UNPAID', 'PAID' (Updated via Iyo Bank API)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable Row Level Security (RLS)
ALTER TABLE public.service_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

-- Simple RLS policies (adjust to real access control rules later)
CREATE POLICY "Enable all access for authenticated users" ON public.service_accounts FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Enable all access for authenticated users" ON public.projects FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Enable all access for authenticated users" ON public.invoices FOR ALL TO authenticated USING (true) WITH CHECK (true);
