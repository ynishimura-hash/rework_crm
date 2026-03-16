-- Migration: 02_tracking.sql
-- Description: Auto-tracking and polymorphic file attachment tables for Activities, Communications, and Files

-- 1. Activities Table (Meetings, Calendar events, etc.)
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

-- 2. Activity Participants Table (M:N mapping between activities and contacts)
CREATE TABLE IF NOT EXISTS public.activity_participants (
    activity_id UUID REFERENCES public.activities(id) ON DELETE CASCADE,
    contact_id UUID REFERENCES public.contacts(id) ON DELETE CASCADE,
    PRIMARY KEY (activity_id, contact_id)
);

-- 3. Communications Table (Emails, LINE messages, etc.)
CREATE TABLE IF NOT EXISTS public.communications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    contact_id UUID REFERENCES public.contacts(id) ON DELETE CASCADE,
    channel_type VARCHAR(50) NOT NULL, -- e.g., 'EMAIL', 'LINE'
    direction VARCHAR(50) NOT NULL, -- 'INBOUND', 'OUTBOUND'
    content TEXT NOT NULL,
    sent_at TIMESTAMP WITH TIME ZONE NOT NULL,
    is_read BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 4. Files Table (Polymorphic associations to attach to any entity)
CREATE TABLE IF NOT EXISTS public.files (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title VARCHAR(255) NOT NULL,
    storage_path TEXT NOT NULL, -- e.g., Supabase Storage bucket path or S3 URL
    file_type VARCHAR(50), -- e.g., 'PDF', 'MP4', 'DOCX'
    extracted_text TEXT, -- Text extracted via AI for full-text search
    
    -- Polymorphic relations
    target_type VARCHAR(50) NOT NULL, -- e.g., 'company', 'contact', 'deal', 'activity'
    target_id UUID NOT NULL, -- The ID of the target record
    
    ai_tags JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Create indices for the polymorphic lookup to optimize queries
CREATE INDEX IF NOT EXISTS idx_files_target ON public.files(target_type, target_id);

-- Enable Row Level Security (RLS)
ALTER TABLE public.activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.communications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.files ENABLE ROW LEVEL SECURITY;

-- Simple RLS policies (adjust to real access control rules later)
CREATE POLICY "Enable all access for authenticated users" ON public.activities FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Enable all access for authenticated users" ON public.activity_participants FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Enable all access for authenticated users" ON public.communications FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Enable all access for authenticated users" ON public.files FOR ALL TO authenticated USING (true) WITH CHECK (true);
