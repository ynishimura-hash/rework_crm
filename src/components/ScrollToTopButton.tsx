"use client";

import { useState, useEffect } from "react";
import { ArrowUp } from "lucide-react";

// スクロールコンテナ内で一定量スクロールすると表示される「トップへ戻る」ボタン
export default function ScrollToTopButton() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // CRMレイアウトのスクロールコンテナを取得
    const scrollContainer = document.querySelector("[data-scroll-container]") as HTMLElement | null;
    if (!scrollContainer) return;

    const onScroll = () => {
      setVisible(scrollContainer.scrollTop > 300);
    };

    scrollContainer.addEventListener("scroll", onScroll, { passive: true });
    return () => scrollContainer.removeEventListener("scroll", onScroll);
  }, []);

  const scrollToTop = () => {
    const scrollContainer = document.querySelector("[data-scroll-container]") as HTMLElement | null;
    if (scrollContainer) {
      scrollContainer.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  if (!visible) return null;

  return (
    <button
      onClick={scrollToTop}
      className="fixed bottom-6 right-6 z-50 flex items-center justify-center w-12 h-12 rounded-full bg-blue-600 text-white shadow-lg shadow-blue-600/25 hover:bg-blue-700 active:scale-95 transition-all md:bottom-8 md:right-8"
      aria-label="トップへ戻る"
    >
      <ArrowUp className="w-5 h-5" />
    </button>
  );
}
