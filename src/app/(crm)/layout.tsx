import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Sidebar from "@/components/layout/Sidebar";
import MobileSidebar from "@/components/layout/MobileSidebar";
import ScrollToTopButton from "@/components/ScrollToTopButton";
import NotificationBell from "@/components/layout/NotificationBell";

// CRM専用レイアウト（サイドバー・ヘッダー付き、認証必須）
export default async function CRMLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // サーバーサイドでセッション確認（開発環境ではバイパス）
  let userName = "";
  let userEmail = "";

  if (process.env.NODE_ENV === "development") {
    userName = "Dev User";
    userEmail = "dev@localhost";
  } else {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      redirect("/auth/login");
    }

    userName = user.user_metadata?.full_name || user.user_metadata?.name || "";
    userEmail = user.email || "";
  }

  return (
    <div className="bg-slate-50/50 text-slate-800 min-h-screen flex selection:bg-blue-100 selection:text-blue-900">
      {/* サイドバー（PC: 固定幅256px、モバイル: 非表示） */}
      <div className="w-64 shrink-0 border-r border-slate-200 bg-white relative z-10 hidden md:block">
        <Sidebar userName={userName} userEmail={userEmail} />
      </div>

      {/* メインコンテンツエリア */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
        {/* ヘッダーエリア */}
        <header className="h-16 flex items-center justify-between px-4 md:px-8 bg-white border-b border-slate-200 sticky top-0 z-10 w-full transition-shadow">
          <div className="flex items-center gap-3 flex-1">
            {/* モバイルハンバーガーメニュー */}
            <MobileSidebar userName={userName} userEmail={userEmail} />
            <div className="flex-1 max-w-xl">
              <div className="relative group">
                <input
                  type="text"
                  placeholder="検索... (Cmd+K)"
                  className="w-full pl-10 pr-4 py-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-medium text-slate-700 placeholder:text-slate-400"
                />
                <svg className="w-4 h-4 absolute left-3.5 top-2.5 text-slate-400 group-hover:text-slate-500 transition-colors" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3 md:gap-5">
            <NotificationBell />
            <div className="h-8 w-8 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-xs ring-2 ring-white cursor-pointer hover:bg-blue-700 transition-colors">
              R
            </div>
          </div>
        </header>

        {/* 各ページのコンポーネントが描画される部分 */}
        <div className="flex-1 overflow-auto p-4 md:p-8 relative" data-scroll-container>
          <div className="max-w-7xl mx-auto w-full">
            {children}
          </div>

          {/* 装飾用背景グラデーション */}
          <div className="fixed bottom-0 right-0 w-96 h-96 bg-blue-500/5 rounded-full blur-3xl pointer-events-none -mr-32 -mb-32 z-[-1]" />
          <div className="fixed top-0 left-0 md:left-64 w-[500px] h-[500px] bg-indigo-500/5 rounded-full blur-3xl pointer-events-none -mt-48 -ml-48 z-[-1]" />
        </div>

        {/* トップへ戻るボタン（全ページ共通） */}
        <ScrollToTopButton />
      </main>
    </div>
  );
}
