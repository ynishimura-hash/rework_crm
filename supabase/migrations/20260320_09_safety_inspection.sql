-- 安全パトロールAI: 建設現場の安全点検管理テーブル

-- 現場マスタ
CREATE TABLE IF NOT EXISTS public.safety_sites (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    address TEXT,
    company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL,
    site_manager VARCHAR(255),
    status VARCHAR(50) DEFAULT '進行中',
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 点検記録
CREATE TABLE IF NOT EXISTS public.safety_inspections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    site_id UUID NOT NULL REFERENCES public.safety_sites(id) ON DELETE CASCADE,
    inspector_name VARCHAR(255) NOT NULL,
    inspection_date DATE NOT NULL DEFAULT CURRENT_DATE,
    weather VARCHAR(50),
    overall_score INTEGER,
    total_hazards INTEGER DEFAULT 0,
    critical_count INTEGER DEFAULT 0,
    status VARCHAR(50) DEFAULT '実施中',
    summary TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 点検写真
CREATE TABLE IF NOT EXISTS public.safety_inspection_photos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    inspection_id UUID NOT NULL REFERENCES public.safety_inspections(id) ON DELETE CASCADE,
    photo_url TEXT NOT NULL,
    photo_location VARCHAR(255),
    ai_raw_response JSONB,
    analyzed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 個別ハザード
CREATE TABLE IF NOT EXISTS public.safety_hazards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    photo_id UUID NOT NULL REFERENCES public.safety_inspection_photos(id) ON DELETE CASCADE,
    inspection_id UUID NOT NULL REFERENCES public.safety_inspections(id) ON DELETE CASCADE,
    site_id UUID NOT NULL REFERENCES public.safety_sites(id) ON DELETE CASCADE,
    severity VARCHAR(20) NOT NULL,
    category VARCHAR(100) NOT NULL,
    description TEXT NOT NULL,
    law_reference TEXT,
    law_detail TEXT,
    recommendation TEXT,
    bbox_x REAL,
    bbox_y REAL,
    bbox_w REAL,
    bbox_h REAL,
    is_recurring BOOLEAN DEFAULT false,
    weight_score INTEGER DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- インデックス
CREATE INDEX idx_safety_inspections_site ON public.safety_inspections(site_id);
CREATE INDEX idx_safety_inspections_date ON public.safety_inspections(inspection_date);
CREATE INDEX idx_safety_hazards_site ON public.safety_hazards(site_id);
CREATE INDEX idx_safety_hazards_category ON public.safety_hazards(category);
CREATE INDEX idx_safety_hazards_severity ON public.safety_hazards(severity);
CREATE INDEX idx_safety_inspection_photos_inspection ON public.safety_inspection_photos(inspection_id);
