import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import ScanBottomNav from "@/components/scan/ScanBottomNav";

// 名刺スキャンPWA — スキャンがトップの独立アプリ
export const metadata: Metadata = {
  title: "名刺スキャン",
  description: "名刺・テキストから顧客情報を自動登録",
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
  return (
    <Suspense>
      <div className="pb-16">
        {children}
      </div>
      <ScanBottomNav />
    </Suspense>
  );
}
