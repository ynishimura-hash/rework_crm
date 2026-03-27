import "./globals.css";
import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";

const inter = Inter({ subsets: ["latin"] });

// ルートレイアウト（共通のhtml/body構造のみ）
// CRM用のサイドバー・ヘッダーは(crm)ルートグループのlayout.tsxで管理
export const metadata: Metadata = {
  title: {
    default: "Rework CRM - 顧客管理システム",
    template: "%s | Rework CRM",
  },
  description: "合同会社Reworkの顧客管理CRMシステム。企業・担当者・商談の管理、freee会計連携、カレンダー・メール統合。",
  manifest: "/manifest.json",
  openGraph: {
    title: "Rework CRM - 顧客管理システム",
    description: "合同会社Reworkの顧客管理CRMシステム。企業・担当者・商談の管理、freee会計連携、カレンダー・メール統合。",
    siteName: "Rework CRM",
    type: "website",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Rework CRM",
  },
};

export const viewport: Viewport = {
  themeColor: "#2563eb",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <head>
        <link rel="apple-touch-icon" href="/icons/crm-192.png" />
      </head>
      <body className={`${inter.className} min-h-screen`}>
        {children}
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
