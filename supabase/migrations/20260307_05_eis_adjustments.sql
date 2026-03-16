-- Migration: 05_eis_adjustments.sql
-- Description: EIS顧客管理システム用のスキーマ調整

-- 1. companies テーブル: ステータス・最終活動日を追加
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT '見込み';
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMP WITH TIME ZONE;

-- 2. contacts テーブル: 優先度を追加
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS priority VARCHAR(20) DEFAULT '中';

-- 3. contacts テーブル: email UNIQUE制約を緩和（NULLや空文字列の重複を許可）
-- 既存のUNIQUE制約を削除して、NULLを除外した部分インデックスに置き換え
ALTER TABLE public.contacts DROP CONSTRAINT IF EXISTS contacts_email_key;
CREATE UNIQUE INDEX IF NOT EXISTS idx_contacts_email_unique
  ON public.contacts (email)
  WHERE email IS NOT NULL AND email != '';

-- 4. deals テーブル: freee連携用カラムを追加
ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS freee_invoice_id VARCHAR(255);

-- 5. services テーブル: RLSポリシーのバグ修正（line 92 of 01_core.sql: FOR SELECT に WITH CHECK）
DROP POLICY IF EXISTS "Enable insert access for authenticated users" ON public.services;
CREATE POLICY "Enable insert access for authenticated users" ON public.services
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Enable update access for authenticated users" ON public.services
  FOR UPDATE TO authenticated USING (true);

-- 6. 検索パフォーマンス用インデックス追加
CREATE INDEX IF NOT EXISTS idx_companies_name ON public.companies(name);
CREATE INDEX IF NOT EXISTS idx_companies_status ON public.companies(status);
CREATE INDEX IF NOT EXISTS idx_contacts_company_id ON public.contacts(company_id);
CREATE INDEX IF NOT EXISTS idx_contacts_name ON public.contacts(name);
CREATE INDEX IF NOT EXISTS idx_deals_company_id ON public.deals(company_id);
CREATE INDEX IF NOT EXISTS idx_deals_contact_id ON public.deals(contact_id);
CREATE INDEX IF NOT EXISTS idx_deals_status ON public.deals(status);
CREATE INDEX IF NOT EXISTS idx_deals_freee_invoice_id ON public.deals(freee_invoice_id);

-- 7. deals テーブル: DELETE用のRLSポリシー追加（既存には無い）
CREATE POLICY "Enable delete access for authenticated users" ON public.deals
  FOR DELETE TO authenticated USING (true);
CREATE POLICY "Enable delete access for authenticated users" ON public.companies
  FOR DELETE TO authenticated USING (true);
CREATE POLICY "Enable delete access for authenticated users" ON public.contacts
  FOR DELETE TO authenticated USING (true);
