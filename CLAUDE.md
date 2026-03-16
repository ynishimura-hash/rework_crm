# Rework CRM (rework-crm)

## プロジェクト概要
株式会社Reworkの顧客管理CRMシステム。企業・担当者・商談の管理、freee会計連携による請求書発行・入金管理を行う。

> **注意**: このプロジェクトは `eis-business-manager` から完全に分離された独立プロジェクトです。EISのコード・データ・環境変数には一切触れないでください。

## インフラ

| 項目 | 値 |
|------|-----|
| **顧客** | 株式会社Rework |
| **Supabase** | `wocyevdjiatficfwvjlm` |
| **Vercel** | `rework-crm.vercel.app` (`prj_T0DPEvSDUJlbe5UfQfO9Os7rlTJ8`) |
| **GitHub** | `ynishimura-hash/rework-crm` |
| **開発ポート** | 3002 |
| **会計連携** | freee API (OAuth 2.0) |
| **Google Cloud** | Rework-CRM プロジェクト |

### Vercel組織
- **Team**: `ynishimura24s-projects` (`team_zx0LIlsmzINS4w5w1tFNNNgI`)

## 技術スタック
- Next.js 16 (App Router) + React 19 + TypeScript
- Tailwind CSS v4（`@tailwindcss/postcss`経由）
- Supabase (PostgreSQL + RLS + Auth)
- lucide-react（アイコン）
- freee API連携（OAuth 2.0）
- Google Gemini AI（名刺スキャン）
- Google Calendar API（スケジューリング）

## 開発コマンド
```bash
npm run dev    # 開発サーバー（ポート3002）
npm run build  # プロダクションビルド
```

## コーディング規約

### 言語
- コード内のコメントは日本語で記述すること
- UIテキスト・ラベルはすべて日本語
- 変数名・関数名は英語（キャメルケース）

### スタイリング（Tailwind CSS）
- Tailwind CSS v4のユーティリティクラスを使用（CSS-in-JSやstyledは使わない）
- インラインでclassNameに直接記述する
- 条件付きクラスには三項演算子またはテンプレートリテラルを使用
- カラーパレット: `slate`（テキスト/背景）, `blue`（プライマリ）, `emerald`（成功）, `rose`（エラー）, `amber`（警告）, `indigo`（アクセント）

### レスポンシブ対応（必須）
- **モバイルファースト**で設計すること（`sm:`, `md:`, `lg:`, `xl:` のブレイクポイントを使用）
- パディング: `p-3 md:p-4` や `px-3 md:px-6` のようにモバイルとデスクトップで分ける
- 一覧ページはテーブル（デスクトップ）とカード（モバイル）の切替表示を実装
- テーブルの不要カラムは `hidden sm:table-cell` や `hidden md:table-cell` で非表示
- タッチターゲットは最低44px確保（`py-2.5` 以上）
- ボタン群には `flex-wrap` を付与してモバイルで折り返し対応
- `md:` ブレイクポイント（768px）を基準にレイアウトを切り替える

### コンポーネント設計
- ページコンポーネント: `src/app/*/page.tsx`
- Server Actions: `src/app/actions/*.ts`（`"use server"` 宣言）
- クライアントコンポーネント: `"use client"` 宣言が必要
- Supabaseクライアント: `src/lib/supabase/admin.ts`（Service Role Key使用、RLSバイパス）

### データベース操作
- CRUD操作はすべてServer Actions経由で行う
- Supabaseの `createAdminClient()` を使用（`SUPABASE_SERVICE_ROLE_KEY`）
- リレーションデータはSupabaseのJOINクエリ（`select('*, contacts(*)')`等）で取得
- マイグレーションは `supabase/migrations/` に配置

### freee連携
- APIルート: `src/app/api/freee/*/route.ts`
- OAuth認証: Cookie（HttpOnly）にアクセストークンを保存
- 401レスポンス時は再認証フローへ誘導

### フロントエンドデザイン（必須）
- フロントエンドのUI/デザインを作成・変更する際は、必ず **frontend-design** スキルを使用すること
- 汎用的・テンプレート的なデザインを避け、独自性のある高品質なUIを目指すこと

### ブランドアセット（必須）
- デザインやアイコンを作成・変更する際は、必ず `brand-assets/` フォルダの内容を参照すること
- ブランドガイドライン（カラー、ロゴ、フォント、トーン等）に沿ったデザインにすること

## ディレクトリ構成
```
src/
  app/
    page.tsx              # ダッシュボード
    companies/            # 企業管理
    contacts/             # 担当者管理
    deals/                # 商談管理
    scan/                 # 名刺スキャン
    actions/              # Server Actions
    api/freee/            # freee連携APIルート
    api/scan/             # 名刺スキャンAPI
    api/google-calendar/  # Googleカレンダー連携
  components/
    layout/               # Sidebar, MobileSidebar
    deals/                # CreateDealModal, CreateFreeeInvoiceModal
  lib/
    supabase/             # Supabaseクライアント (client.ts, server.ts, admin.ts)
    gemini.ts             # Gemini AI クライアント
brand-assets/             # ブランドアセット（ロゴ、カラー定義、アイコン等）
supabase/
  migrations/             # DBマイグレーションSQL
docs/                     # 仕様書
```

## 環境変数（.env.local）
- `NEXT_PUBLIC_SUPABASE_URL` - Rework Supabase URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Rework匿名キー
- `SUPABASE_SERVICE_ROLE_KEY` - Reworkサービスロールキー
- `FREEE_CLIENT_ID` / `FREEE_CLIENT_SECRET` / `FREEE_REDIRECT_URI` - freee API
- `GEMINI_API_KEY` - Google Gemini AI
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` - Google OAuth / Calendar

## 開発ワークフロー（必須）
コードを書いたら以下の手順を必ず実行すること:
1. **ローカルサーバーを起動する** — `npm run dev` でdev serverを立ち上げる
2. **Puppeteerでスクリーンショットを撮って確認する** — 変更した画面をキャプチャし、表示崩れや不具合がないか目視確認する
3. **問題があれば修正する** — レイアウト崩れ、エラー、表示不具合を発見した場合はその場で修正し、再度スクリーンショットで確認する

## 注意事項
- セキュリティ: Service Role Keyはサーバーサイド（Server Actions / API Routes）でのみ使用
- このプロジェクトはEIS顧客管理システムとは完全に独立。EISのSupabase・Vercel・データには触れないこと
- Reworkのデータファイルは `2ndBrain/06_仕事/Rework様/` に格納（このリポジトリ内に置かない）
