"use client";

import { useState, useRef, useEffect } from "react";
import { Camera, FileText, Upload, ArrowLeft, Users, Building2, Check, Loader2, X, ClipboardPaste, Edit3, FolderOpen, Image as ImageIcon, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

type InputMode = "camera" | "text" | "drive" | null;

interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  thumbnailLink?: string;
  createdTime?: string;
  size?: string;
}

interface ExtractedData {
  company?: {
    name?: string;
    industry?: string;
    address?: string;
    hp_url?: string;
  };
  contact?: {
    last_name?: string;
    first_name?: string;
    furigana?: string;
    department?: string;
    position?: string;
    email?: string;
    phone?: string;
  };
}

export default function ScanPage() {
  const [mode, setMode] = useState<InputMode>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null); // 1枚の写真
  const [textInput, setTextInput] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [extractedResults, setExtractedResults] = useState<ExtractedData[]>([]);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [saveStatuses, setSaveStatuses] = useState<Record<number, "idle" | "saving" | "saved" | "error">>({});
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Drive関連
  const searchParams = useSearchParams();
  const [driveFiles, setDriveFiles] = useState<DriveFile[]>([]);
  const [selectedDriveFiles, setSelectedDriveFiles] = useState<Set<string>>(new Set());
  const [isDriveLoading, setIsDriveLoading] = useState(false);
  const [driveNeedsAuth, setDriveNeedsAuth] = useState(false);

  // URLパラメータでdriveモードに自動切替
  useEffect(() => {
    if (searchParams.get("mode") === "drive") {
      setMode("drive");
      loadDriveFiles();
    }
  }, [searchParams]);

  const loadDriveFiles = async () => {
    setIsDriveLoading(true);
    setDriveNeedsAuth(false);
    try {
      const res = await fetch("/api/google-drive/files");
      const data = await res.json();
      if (data.needsAuth) {
        setDriveNeedsAuth(true);
        return;
      }
      if (!res.ok) throw new Error(data.error);
      setDriveFiles(data.files || []);
    } catch (err) {
      console.error("Drive files error:", err);
    } finally {
      setIsDriveLoading(false);
    }
  };

  const toggleDriveFile = (fileId: string) => {
    setSelectedDriveFiles(prev => {
      const next = new Set(prev);
      if (next.has(fileId)) next.delete(fileId);
      else next.add(fileId);
      return next;
    });
  };

  const handleDriveExtract = async () => {
    if (selectedDriveFiles.size === 0) return;
    setIsProcessing(true);
    try {
      // 選択ファイルをダウンロードしてbase64に変換
      const images: string[] = [];
      for (const fileId of selectedDriveFiles) {
        const res = await fetch(`/api/google-drive/download?fileId=${fileId}`);
        if (!res.ok) continue;
        const data = await res.json();
        if (data.dataUri) images.push(data.dataUri);
      }

      if (images.length === 0) {
        alert("画像のダウンロードに失敗しました");
        return;
      }

      // 抽出API呼び出し
      const extractRes = await fetch("/api/scan/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(images.length === 1 ? { image: images[0] } : { images }),
      });

      if (!extractRes.ok) throw new Error("抽出に失敗しました");
      const result = await extractRes.json();
      setExtractedResults(result.results || [result]);
    } catch (err) {
      console.error("Drive extract error:", err);
      alert("情報の抽出に失敗しました。もう一度お試しください。");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || !files[0]) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      setImagePreview(ev.target?.result as string);
    };
    reader.readAsDataURL(files[0]);

    // input をリセットして同じファイルを再選択可能にする
    e.target.value = '';
  };

  const handleExtract = async () => {
    setIsProcessing(true);
    try {
      if (mode === "camera" && imagePreview) {
        // 1枚の写真から複数名刺を検出
        const res = await fetch("/api/scan/extract", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ image: imagePreview, detectMultiple: true }),
        });
        if (!res.ok) throw new Error("抽出に失敗しました");
        const data = await res.json();
        setExtractedResults(data.results || [data]);
      } else if (mode === "text" && textInput.trim()) {
        const res = await fetch("/api/scan/extract", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: textInput.trim() }),
        });
        if (!res.ok) throw new Error("抽出に失敗しました");
        const data = await res.json();
        setExtractedResults([data]);
      }
    } catch (err) {
      console.error("Extract error:", err);
      alert("情報の抽出に失敗しました。もう一度お試しください。");
    } finally {
      setIsProcessing(false);
    }
  };

  // 登録結果（companyId, contactId）を保持
  const [savedResults, setSavedResults] = useState<Record<number, { companyId?: string; contactId?: string; companyAction?: string; contactAction?: string }>>({});

  const handleSave = async (index: number) => {
    const data = extractedResults[index];
    if (!data) return;

    setSaveStatuses(prev => ({ ...prev, [index]: "saving" }));
    try {
      const res = await fetch("/api/scan/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (!res.ok) throw new Error("登録に失敗しました");
      const result = await res.json();
      setSaveStatuses(prev => ({ ...prev, [index]: "saved" }));
      setSavedResults(prev => ({
        ...prev,
        [index]: {
          companyId: result.company?.id,
          contactId: result.contact?.id,
          companyAction: result.company?.action,
          contactAction: result.contact?.action,
        },
      }));
    } catch (err) {
      console.error("Save error:", err);
      setSaveStatuses(prev => ({ ...prev, [index]: "error" }));
    }
  };

  const handleSaveAll = async () => {
    for (let i = 0; i < extractedResults.length; i++) {
      if (saveStatuses[i] !== "saved") {
        await handleSave(i);
      }
    }
  };

  const updateField = (index: number, section: "company" | "contact", field: string, value: string) => {
    setExtractedResults(prev => {
      const updated = [...prev];
      const item = { ...updated[index] };
      if (section === "company") {
        item.company = { ...item.company, [field]: value };
      } else {
        item.contact = { ...item.contact, [field]: value };
      }
      updated[index] = item;
      return updated;
    });
  };

  const reset = () => {
    setMode(null);
    setImagePreview(null);
    setTextInput("");
    setExtractedResults([]);
    setSaveStatuses({});
    setSavedResults({});
    setEditingIndex(null);
    setIsProcessing(false);
    setSelectedDriveFiles(new Set());
  };

  const allSaved = extractedResults.length > 0 && extractedResults.every((_, i) => saveStatuses[i] === "saved");

  // 結果表示画面
  if (extractedResults.length > 0) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-amber-50 to-orange-50">
        <header className="sticky top-0 z-10 bg-white/80 backdrop-blur-md border-b border-amber-200 px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => { setExtractedResults([]); setEditingIndex(null); }} className="p-2 -ml-2 rounded-full hover:bg-amber-100 transition-colors">
              <ArrowLeft className="w-5 h-5 text-amber-700" />
            </button>
            <h1 className="text-lg font-bold text-amber-900">
              抽出結果 ({extractedResults.length}件)
            </h1>
          </div>
          {!allSaved && extractedResults.length > 1 && (
            <button
              onClick={handleSaveAll}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
            >
              全て登録
            </button>
          )}
        </header>

        <div className="p-4 space-y-4 max-w-lg mx-auto">
          {extractedResults.map((data, index) => (
            <ResultCard
              key={index}
              index={index}
              data={data}
              isEditing={editingIndex === index}
              saveStatus={saveStatuses[index] || "idle"}
              savedResult={savedResults[index]}
              onEdit={() => setEditingIndex(editingIndex === index ? null : index)}
              onSave={() => handleSave(index)}
              onUpdateField={(section, field, value) => updateField(index, section, field, value)}
            />
          ))}

          {allSaved && (
            <div className="flex flex-col items-center gap-3 py-6">
              <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
                <Check className="w-8 h-8 text-green-600" />
              </div>
              <p className="text-green-700 font-semibold">
                {extractedResults.length}件の顧客情報を登録しました
              </p>
              <div className="flex flex-col gap-2 w-full max-w-xs">
                <button onClick={reset} className="w-full py-2.5 bg-amber-600 text-white rounded-xl font-medium hover:bg-amber-700 transition-colors">
                  続けてスキャン
                </button>
                <Link href="/contacts" className="w-full py-2.5 bg-white border border-slate-200 text-slate-700 rounded-xl font-medium text-center hover:bg-slate-50 transition-colors flex items-center justify-center gap-2">
                  <Users className="w-4 h-4" />
                  顧客一覧を見る
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // メイン画面
  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 to-orange-50">
      <header className="sticky top-0 z-10 bg-white/80 backdrop-blur-md border-b border-amber-200 px-4 py-3 flex items-center gap-3">
        {mode ? (
          <button onClick={() => { setMode(null); setImagePreview(null); setTextInput(""); }} className="p-2 -ml-2 rounded-full hover:bg-amber-100 transition-colors">
            <ArrowLeft className="w-5 h-5 text-amber-700" />
          </button>
        ) : (
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center">
            <Camera className="w-5 h-5 text-white" />
          </div>
        )}
        <h1 className="text-lg font-bold text-amber-900">
          {mode === "camera" ? "名刺・スクショを読み取り" : mode === "text" ? "テキストから登録" : mode === "drive" ? "Google Drive から読み取り" : "顧客情報を登録"}
        </h1>
      </header>

      <div className="p-4 max-w-lg mx-auto">
        {!mode && (
          <div className="space-y-4 pt-8">
            <p className="text-center text-amber-700 text-sm mb-6">
              名刺やLINEのスクショ、テキスト情報から<br />AIが自動で顧客情報を読み取ります
            </p>

            <button
              onClick={() => setMode("camera")}
              className="w-full bg-white rounded-2xl border-2 border-amber-200 p-6 flex items-center gap-4 hover:border-amber-400 hover:shadow-md transition-all active:scale-[0.98]"
            >
              <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-amber-100 to-orange-100 flex items-center justify-center shrink-0">
                <Camera className="w-7 h-7 text-amber-600" />
              </div>
              <div className="text-left">
                <h3 className="font-bold text-slate-900">写真・スクショから読み取り</h3>
                <p className="text-sm text-slate-500 mt-0.5">1枚の写真に最大4枚の名刺を自動検出</p>
              </div>
            </button>

            <button
              onClick={() => setMode("text")}
              className="w-full bg-white rounded-2xl border-2 border-blue-200 p-6 flex items-center gap-4 hover:border-blue-400 hover:shadow-md transition-all active:scale-[0.98]"
            >
              <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-blue-100 to-indigo-100 flex items-center justify-center shrink-0">
                <FileText className="w-7 h-7 text-blue-600" />
              </div>
              <div className="text-left">
                <h3 className="font-bold text-slate-900">テキストをコピペ</h3>
                <p className="text-sm text-slate-500 mt-0.5">自己紹介文、メール署名、LINE文章</p>
              </div>
            </button>

            {/* Google Drive一括インポート */}
            <div className="pt-4 border-t border-amber-200">
              <button
                onClick={() => { setMode("drive"); loadDriveFiles(); }}
                className="w-full bg-white rounded-2xl border-2 border-emerald-200 p-6 flex items-center gap-4 hover:border-emerald-400 hover:shadow-md transition-all active:scale-[0.98]"
              >
                <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-emerald-100 to-green-100 flex items-center justify-center shrink-0">
                  <FolderOpen className="w-7 h-7 text-emerald-600" />
                </div>
                <div className="text-left">
                  <h3 className="font-bold text-slate-900">Google Drive から一括インポート</h3>
                  <p className="text-sm text-slate-500 mt-0.5">Driveの名刺画像をまとめて読み取り</p>
                </div>
              </button>
            </div>
          </div>
        )}

        {mode === "camera" && (
          <div className="space-y-4 pt-4">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleImageUpload}
              className="hidden"
            />

            {/* 撮影済み画像プレビュー */}
            {imagePreview ? (
              <div className="space-y-3">
                <div className="relative rounded-2xl overflow-hidden border-2 border-amber-200">
                  <img src={imagePreview} alt="撮影した名刺" className="w-full object-contain max-h-[50vh]" />
                  <button
                    onClick={() => setImagePreview(null)}
                    className="absolute top-2 right-2 w-8 h-8 bg-black/50 rounded-full flex items-center justify-center text-white hover:bg-black/70 transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <p className="text-xs text-center text-amber-600">
                  1枚の写真に最大4枚の名刺を並べて撮影できます。AIが自動で検出します。
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <button
                  onClick={() => {
                    if (fileInputRef.current) {
                      fileInputRef.current.setAttribute('capture', 'environment');
                      fileInputRef.current.click();
                    }
                  }}
                  className="w-full aspect-[4/3] bg-white rounded-2xl border-2 border-dashed border-amber-300 flex flex-col items-center justify-center gap-3 hover:border-amber-500 hover:bg-amber-50/50 transition-all active:scale-[0.98]"
                >
                  <div className="w-16 h-16 rounded-full bg-amber-100 flex items-center justify-center">
                    <Camera className="w-8 h-8 text-amber-600" />
                  </div>
                  <div className="text-center">
                    <p className="font-semibold text-amber-800">タップして撮影</p>
                    <p className="text-xs text-amber-600 mt-1">名刺を1〜4枚並べて1枚の写真に収めてください</p>
                  </div>
                </button>

                <button
                  onClick={() => {
                    if (fileInputRef.current) {
                      fileInputRef.current.removeAttribute('capture');
                      fileInputRef.current.click();
                    }
                  }}
                  className="w-full py-3.5 bg-white rounded-xl border border-amber-200 text-amber-700 font-medium flex items-center justify-center gap-2 hover:bg-amber-50 transition-colors active:scale-[0.98]"
                >
                  <Upload className="w-4 h-4" />
                  ライブラリから選択
                </button>
              </div>
            )}

            {/* 読み取りボタン */}
            {imagePreview && (
              <button
                onClick={handleExtract}
                disabled={isProcessing}
                className="w-full py-3.5 bg-amber-600 text-white rounded-xl font-semibold text-base hover:bg-amber-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    AIが名刺を検出＆HP情報検索中...
                  </>
                ) : (
                  <>
                    <Camera className="w-5 h-5" />
                    AIで名刺を読み取る
                  </>
                )}
              </button>
            )}
          </div>
        )}

        {mode === "text" && (
          <div className="space-y-4 pt-4">
            <div className="relative">
              <textarea
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                placeholder={"ここにテキストを貼り付けてください\n\n例:\n山田太郎\n株式会社ABC 営業部 部長\nメール: yamada@abc.co.jp\n電話: 03-1234-5678"}
                className="w-full h-64 p-4 bg-white border-2 border-blue-200 rounded-2xl text-sm resize-none focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all placeholder:text-slate-400"
              />
              <button
                onClick={async () => {
                  try {
                    const text = await navigator.clipboard.readText();
                    setTextInput(text);
                  } catch {
                    // Clipboard API not available
                  }
                }}
                className="absolute top-3 right-3 px-3 py-1.5 bg-blue-50 text-blue-600 rounded-lg text-xs font-medium flex items-center gap-1 hover:bg-blue-100 transition-colors"
              >
                <ClipboardPaste className="w-3.5 h-3.5" />
                貼り付け
              </button>
            </div>

            <button
              onClick={handleExtract}
              disabled={isProcessing || !textInput.trim()}
              className="w-full py-3.5 bg-blue-600 text-white rounded-xl font-semibold text-base hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  AIが解析＆HP情報補完中...
                </>
              ) : (
                <>
                  <FileText className="w-5 h-5" />
                  AIで情報を抽出
                </>
              )}
            </button>
          </div>
        )}

        {mode === "drive" && (
          <div className="space-y-4 pt-4">
            {/* 認証が必要な場合 */}
            {driveNeedsAuth && (
              <div className="text-center space-y-4 py-8">
                <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto">
                  <FolderOpen className="w-8 h-8 text-emerald-600" />
                </div>
                <p className="text-sm text-slate-600">Google Driveに接続して名刺画像を読み込みます</p>
                <a
                  href="/api/google-drive/auth"
                  className="inline-flex items-center gap-2 px-6 py-3 bg-emerald-600 text-white rounded-xl font-semibold hover:bg-emerald-700 transition-colors"
                >
                  <FolderOpen className="w-5 h-5" />
                  Google Drive に接続
                </a>
              </div>
            )}

            {/* ローディング */}
            {isDriveLoading && (
              <div className="flex items-center justify-center py-12 gap-3">
                <Loader2 className="w-6 h-6 animate-spin text-emerald-600" />
                <span className="text-sm text-slate-600">Driveからファイルを取得中...</span>
              </div>
            )}

            {/* ファイル一覧 */}
            {!isDriveLoading && !driveNeedsAuth && (
              <>
                <div className="flex items-center justify-between">
                  <p className="text-sm text-slate-600">
                    {driveFiles.length === 0 ? "画像ファイルが見つかりません" : `${driveFiles.length}件の画像`}
                  </p>
                  <button
                    onClick={loadDriveFiles}
                    className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                  >
                    <RefreshCw className="w-4 h-4" />
                  </button>
                </div>

                {driveFiles.length > 0 && (
                  <div className="grid grid-cols-3 gap-2">
                    {driveFiles.filter(f => f.mimeType.startsWith("image/")).map(file => {
                      const isSelected = selectedDriveFiles.has(file.id);
                      return (
                        <button
                          key={file.id}
                          onClick={() => toggleDriveFile(file.id)}
                          className={`relative rounded-xl overflow-hidden border-2 aspect-square transition-all ${
                            isSelected ? "border-emerald-500 ring-2 ring-emerald-500/30" : "border-slate-200 hover:border-slate-300"
                          }`}
                        >
                          {file.thumbnailLink ? (
                            <img src={file.thumbnailLink} alt={file.name} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full bg-slate-100 flex items-center justify-center">
                              <ImageIcon className="w-8 h-8 text-slate-300" />
                            </div>
                          )}
                          {isSelected && (
                            <div className="absolute inset-0 bg-emerald-500/20 flex items-center justify-center">
                              <div className="w-8 h-8 rounded-full bg-emerald-500 flex items-center justify-center">
                                <Check className="w-5 h-5 text-white" />
                              </div>
                            </div>
                          )}
                          <div className="absolute bottom-0 left-0 right-0 bg-black/50 px-1.5 py-0.5">
                            <p className="text-[10px] text-white truncate">{file.name}</p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* 読み取りボタン */}
                {selectedDriveFiles.size > 0 && (
                  <button
                    onClick={handleDriveExtract}
                    disabled={isProcessing}
                    className="w-full py-3.5 bg-emerald-600 text-white rounded-xl font-semibold text-base hover:bg-emerald-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {isProcessing ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        AIが読み取り＆HP情報補完中... ({selectedDriveFiles.size}枚)
                      </>
                    ) : (
                      <>
                        <Camera className="w-5 h-5" />
                        選択した{selectedDriveFiles.size}枚をAIで読み取る
                      </>
                    )}
                  </button>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// 結果カード（編集可能）
function ResultCard({
  index,
  data,
  isEditing,
  saveStatus,
  savedResult,
  onEdit,
  onSave,
  onUpdateField,
}: {
  index: number;
  data: ExtractedData;
  isEditing: boolean;
  saveStatus: "idle" | "saving" | "saved" | "error";
  savedResult?: { companyId?: string; contactId?: string; companyAction?: string; contactAction?: string };
  onEdit: () => void;
  onSave: () => void;
  onUpdateField: (section: "company" | "contact", field: string, value: string) => void;
}) {
  if (saveStatus === "saved") {
    return (
      <div className="bg-green-50 rounded-2xl border border-green-200 overflow-hidden">
        <div className="p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center shrink-0">
            <Check className="w-5 h-5 text-green-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-green-800 truncate">
              {data.company?.name || "企業名なし"} — {data.contact?.last_name || ""}{data.contact?.first_name || ""}
            </p>
            <p className="text-xs text-green-600">
              {savedResult?.companyAction === "created" ? "企業を新規登録" : savedResult?.companyAction === "matched" ? "既存企業と一致" : ""}
              {savedResult?.companyAction && savedResult?.contactAction ? " / " : ""}
              {savedResult?.contactAction === "created" ? "担当者を新規登録" : savedResult?.contactAction === "matched" ? "既存担当者と一致" : ""}
            </p>
          </div>
        </div>
        {/* 詳細リンク */}
        <div className="flex border-t border-green-200">
          {savedResult?.contactId && (
            <Link
              href={`/contacts/${savedResult.contactId}`}
              className="flex-1 py-2.5 text-center text-xs font-medium text-green-700 hover:bg-green-100 transition-colors flex items-center justify-center gap-1"
            >
              <Users className="w-3.5 h-3.5" />
              担当者を見る
            </Link>
          )}
          {savedResult?.companyId && savedResult?.contactId && (
            <div className="w-px bg-green-200" />
          )}
          {savedResult?.companyId && (
            <Link
              href={`/companies/${savedResult.companyId}`}
              className="flex-1 py-2.5 text-center text-xs font-medium text-green-700 hover:bg-green-100 transition-colors flex items-center justify-center gap-1"
            >
              <Building2 className="w-3.5 h-3.5" />
              企業を見る
            </Link>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-amber-200 overflow-hidden">
      {/* カードヘッダー */}
      <div className="px-4 py-3 bg-amber-50 border-b border-amber-100 flex items-center justify-between">
        <span className="text-sm font-semibold text-amber-800">名刺 {index + 1}</span>
        <button
          onClick={onEdit}
          className={`px-3 py-1 rounded-lg text-xs font-medium flex items-center gap-1 transition-colors ${
            isEditing ? "bg-amber-200 text-amber-800" : "bg-amber-100 text-amber-600 hover:bg-amber-200"
          }`}
        >
          <Edit3 className="w-3 h-3" />
          {isEditing ? "完了" : "編集"}
        </button>
      </div>

      <div className="p-4 space-y-3">
        {/* 企業情報 */}
        {(data.company?.name || isEditing) && (
          <div className="space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-700">
              <Building2 className="w-3.5 h-3.5" />
              企業情報
            </div>
            <EditableField label="企業名" value={data.company?.name || ""} isEditing={isEditing} onChange={v => onUpdateField("company", "name", v)} />
            <EditableField label="業種" value={data.company?.industry || ""} isEditing={isEditing} onChange={v => onUpdateField("company", "industry", v)} />
            <EditableField label="住所" value={data.company?.address || ""} isEditing={isEditing} onChange={v => onUpdateField("company", "address", v)} />
            <EditableField label="URL" value={data.company?.hp_url || ""} isEditing={isEditing} onChange={v => onUpdateField("company", "hp_url", v)} />
          </div>
        )}

        {/* 担当者情報 */}
        {(data.contact?.last_name || data.contact?.first_name || isEditing) && (
          <div className="space-y-2 pt-2 border-t border-slate-100">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-blue-700">
              <Users className="w-3.5 h-3.5" />
              担当者情報
            </div>
            <div className="grid grid-cols-2 gap-2">
              <EditableField label="姓" value={data.contact?.last_name || ""} isEditing={isEditing} onChange={v => onUpdateField("contact", "last_name", v)} />
              <EditableField label="名" value={data.contact?.first_name || ""} isEditing={isEditing} onChange={v => onUpdateField("contact", "first_name", v)} />
            </div>
            <EditableField label="ふりがな" value={data.contact?.furigana || ""} isEditing={isEditing} onChange={v => onUpdateField("contact", "furigana", v)} />
            <EditableField label="部署" value={data.contact?.department || ""} isEditing={isEditing} onChange={v => onUpdateField("contact", "department", v)} />
            <EditableField label="役職" value={data.contact?.position || ""} isEditing={isEditing} onChange={v => onUpdateField("contact", "position", v)} />
            <EditableField label="メール" value={data.contact?.email || ""} isEditing={isEditing} onChange={v => onUpdateField("contact", "email", v)} />
            <EditableField label="電話" value={data.contact?.phone || ""} isEditing={isEditing} onChange={v => onUpdateField("contact", "phone", v)} />
          </div>
        )}
      </div>

      {/* 登録ボタン */}
      <div className="px-4 py-3 border-t border-amber-100">
        <button
          onClick={onSave}
          disabled={saveStatus === "saving"}
          className="w-full py-2.5 bg-blue-600 text-white rounded-xl font-medium text-sm hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {saveStatus === "saving" ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              登録中...
            </>
          ) : (
            <>
              <Check className="w-4 h-4" />
              顧客として登録
            </>
          )}
        </button>
        {saveStatus === "error" && (
          <p className="text-center text-xs text-red-600 mt-2">登録に失敗しました。もう一度お試しください。</p>
        )}
      </div>
    </div>
  );
}

// 編集可能フィールド
function EditableField({
  label,
  value,
  isEditing,
  onChange,
}: {
  label: string;
  value: string;
  isEditing: boolean;
  onChange: (value: string) => void;
}) {
  if (isEditing) {
    return (
      <div>
        <label className="text-xs font-medium text-slate-500">{label}</label>
        <input
          type="text"
          value={value}
          onChange={e => onChange(e.target.value)}
          className="w-full mt-0.5 px-2.5 py-1.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
          placeholder={`${label}を入力`}
        />
      </div>
    );
  }

  if (!value) return null;

  return (
    <div>
      <label className="text-xs font-medium text-slate-500">{label}</label>
      <p className="text-sm font-medium text-slate-900 mt-0.5">{value}</p>
    </div>
  );
}
