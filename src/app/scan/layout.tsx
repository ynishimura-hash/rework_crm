import type { Metadata, Viewport } from "next";

// 名刺スキャン専用レイアウト（独立PWA）
// CRMのサイドバーなし、スキャン専用のフルスクリーンUI
export const metadata: Metadata = {
  title: "名刺スキャン",
  description: "名刺・テキストから顧客情報を自動登録",
  manifest: "/manifest-scan.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "名刺スキャン",
  },
};

export const viewport: Viewport = {
  themeColor: "#d97706",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function ScanLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
