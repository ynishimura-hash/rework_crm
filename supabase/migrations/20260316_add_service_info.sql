-- サービス提供に必要な要素を格納するカラム
-- 構造例: { "needs": "...", "budget": "...", "timeline": "...", "notes": "..." }
ALTER TABLE companies ADD COLUMN IF NOT EXISTS service_info jsonb DEFAULT '{}'::jsonb;

COMMENT ON COLUMN companies.service_info IS 'サービス提供に必要な要素（ニーズ、予算、スケジュール、メモ等）';
