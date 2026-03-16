-- Migration: 04_seed.sql
-- Description: Test seed data for Companies, Contacts, Services, Deals, and Activities

-- 1. Insert dummy Services (EIS Services)
INSERT INTO public.services (id, name, base_price, unit, is_active)
VALUES
    ('11111111-1111-1111-1111-111111111111', 'Ehime Base 法人プラン', 50000, '月額', true),
    ('22222222-2222-2222-2222-222222222222', 'リクルートサイト動画制作', 300000, '一式', true),
    ('33333333-3333-3333-3333-333333333333', '魅力発見セッション', 100000, '1回', true)
ON CONFLICT (id) DO NOTHING;

-- 2. Insert a dummy Company
INSERT INTO public.companies (id, name, industry, hp_url, summary, tags)
VALUES
    ('44444444-4444-4444-4444-444444444444', '株式会社テストテクノロジー', 'IT', 'https://test-tech.example.com', 'テストデータ用のIT企業です。', '["DX", "見込み客"]')
ON CONFLICT (id) DO NOTHING;

-- 3. Insert a dummy Contact
INSERT INTO public.contacts (id, company_id, name, department, position, email, phone)
VALUES
    ('55555555-5555-5555-5555-555555555555', '44444444-4444-4444-4444-444444444444', '山田 太郎', '営業部', '部長', 'yamada.taro@example.com', '03-1234-5678')
ON CONFLICT (id) DO NOTHING;

-- 4. Insert a dummy Deal
INSERT INTO public.deals (id, company_id, contact_id, title, status, estimated_amount, close_date)
VALUES
    ('66666666-6666-6666-6666-666666666666', '44444444-4444-4444-4444-444444444444', '55555555-5555-5555-5555-555555555555', '全社DX推進と人材育成研修', '見積送付', 350000, '2026-03-31')
ON CONFLICT (id) DO NOTHING;

-- 5. Insert Deal Services (Custom pricing)
INSERT INTO public.deal_services (id, deal_id, service_id, custom_price, quantity, notes)
VALUES
    ('77777777-7777-7777-7777-777777777777', '66666666-6666-6666-6666-666666666666', '11111111-1111-1111-1111-111111111111', 50000, 1, '定価通り'),
    ('88888888-8888-8888-8888-888888888888', '66666666-6666-6666-6666-666666666666', '22222222-2222-2222-2222-222222222222', 280000, 1, 'セット割引（2万円引き）')
ON CONFLICT (id) DO NOTHING;

-- 6. Insert a dummy Activity
INSERT INTO public.activities (id, company_id, deal_id, title, start_time, meeting_url, ai_summary)
VALUES
    ('99999999-9999-9999-9999-999999999999', '44444444-4444-4444-4444-444444444444', '66666666-6666-6666-6666-666666666666', '初回ヒアリング(Ehime Base導入)', '2026-02-25 10:00:00+09', 'https://zoom.us/j/test', 'AI要約: えひめベースの法人導入に前向き。まずは動画制作も含め見積提案することになった。')
ON CONFLICT (id) DO NOTHING;

-- 7. Add Contact to Activity Participants
INSERT INTO public.activity_participants (activity_id, contact_id)
VALUES
    ('99999999-9999-9999-9999-999999999999', '55555555-5555-5555-5555-555555555555')
ON CONFLICT (activity_id, contact_id) DO NOTHING;
