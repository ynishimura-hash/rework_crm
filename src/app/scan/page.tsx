"use client";

import { useState, useRef } from "react";
import { Camera, FileText, Upload, ArrowLeft, Users, Building2, Check, Loader2, X, ClipboardPaste, Plus, Trash2, Edit3, FolderOpen } from "lucide-react";
import Link from "next/link";

type InputMode = "camera" | "text" | null;

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

const MAX_IMAGES = 4;

export default function ScanPage() {
  const [mode, setMode] = useState<InputMode>(null);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [textInput, setTextInput] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [extractedResults, setExtractedResults] = useState<ExtractedData[]>([]);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [saveStatuses, setSaveStatuses] = useState<Record<number, "idle" | "saving" | "saved" | "error">>({});
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    const remaining = MAX_IMAGES - imagePreviews.length;
    const filesToRead = Array.from(files).slice(0, remaining);

    filesToRead.forEach(file => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        setImagePreviews(prev => {
          if (prev.length >= MAX_IMAGES) return prev;
          return [...prev, ev.target?.result as string];
        });
      };
      reader.readAsDataURL(file);
    });

    // input をリセットして同じファイルを再選択可能にする
    e.target.value = '';
  };

  const removeImage = (index: number) => {
    setImagePreviews(prev => prev.filter((_, i) => i !== index));
  };

  const handleExtract = async () => {
    setIsProcessing(true);
    try {
      if (mode === "camera" && imagePreviews.length > 0) {
        if (imagePreviews.length === 1) {
          // 単一画像
          const res = await fetch("/api/scan/extract", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ image: imagePreviews[0] }),
          });
          if (!res.ok) throw new Error("抽出に失敗しました");
          const data = await res.json();
          setExtractedResults([data]);
        } else {
          // 複数画像
          const res = await fetch("/api/scan/extract", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ images: imagePreviews }),
          });
          if (!res.ok) throw new Error("抽出に失敗しました");
          const data = await res.json();
          setExtractedResults(data.results || []);
        }
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
      setSaveStatuses(prev => ({ ...prev, [index]: "saved" }));
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
    setImagePreviews([]);
    setTextInput("");
    setExtractedResults([]);
    setSaveStatuses({});
    setEditingIndex(null);
    setIsProcessing(false);
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
              <button onClick={reset} className="px-6 py-2.5 bg-amber-600 text-white rounded-xl font-medium hover:bg-amber-700 transition-colors">
                続けてスキャン
              </button>
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
          <button onClick={() => { setMode(null); setImagePreviews([]); setTextInput(""); }} className="p-2 -ml-2 rounded-full hover:bg-amber-100 transition-colors">
            <ArrowLeft className="w-5 h-5 text-amber-700" />
          </button>
        ) : (
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center">
            <Camera className="w-5 h-5 text-white" />
          </div>
        )}
        <h1 className="text-lg font-bold text-amber-900">
          {mode === "camera" ? "名刺・スクショを読み取り" : mode === "text" ? "テキストから登録" : "顧客情報を登録"}
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
                <p className="text-sm text-slate-500 mt-0.5">名刺1〜4枚まで一括読み取り対応</p>
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

            {/* 一括インポートリンク（将来のPhase3） */}
            <div className="pt-4 border-t border-amber-200">
              <div className="w-full bg-slate-50 rounded-2xl border-2 border-slate-200 p-6 flex items-center gap-4 opacity-60 cursor-not-allowed">
                <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center shrink-0">
                  <FolderOpen className="w-7 h-7 text-slate-400" />
                </div>
                <div className="text-left">
                  <h3 className="font-bold text-slate-500">Google Drive から一括インポート</h3>
                  <p className="text-sm text-slate-400 mt-0.5">近日公開予定</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {mode === "camera" && (
          <div className="space-y-4 pt-4">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={handleImageUpload}
              className="hidden"
            />

            {/* 画像プレビューグリッド */}
            {imagePreviews.length > 0 && (
              <div className="grid grid-cols-2 gap-3">
                {imagePreviews.map((preview, index) => (
                  <div key={index} className="relative rounded-xl overflow-hidden border border-amber-200 aspect-[3/4]">
                    <img src={preview} alt={`名刺 ${index + 1}`} className="w-full h-full object-cover" />
                    <button
                      onClick={() => removeImage(index)}
                      className="absolute top-1.5 right-1.5 w-7 h-7 bg-black/50 rounded-full flex items-center justify-center text-white hover:bg-black/70 transition-colors"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                    <div className="absolute bottom-1.5 left-1.5 px-2 py-0.5 bg-black/50 rounded-full text-white text-xs">
                      {index + 1}/{imagePreviews.length}
                    </div>
                  </div>
                ))}

                {/* 追加ボタン */}
                {imagePreviews.length < MAX_IMAGES && (
                  <button
                    onClick={() => {
                      if (fileInputRef.current) {
                        fileInputRef.current.removeAttribute('capture');
                        fileInputRef.current.click();
                      }
                    }}
                    className="rounded-xl border-2 border-dashed border-amber-300 aspect-[3/4] flex flex-col items-center justify-center gap-2 hover:border-amber-500 hover:bg-amber-50/50 transition-all"
                  >
                    <Plus className="w-8 h-8 text-amber-400" />
                    <span className="text-xs text-amber-600">追加 (残り{MAX_IMAGES - imagePreviews.length}枚)</span>
                  </button>
                )}
              </div>
            )}

            {/* 画像がない場合の初期画面 */}
            {imagePreviews.length === 0 && (
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
                    <p className="text-xs text-amber-600 mt-1">名刺やスクショを撮影（最大{MAX_IMAGES}枚）</p>
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
                  ライブラリから選択（複数可）
                </button>
              </div>
            )}

            {/* 読み取りボタン */}
            {imagePreviews.length > 0 && (
              <button
                onClick={handleExtract}
                disabled={isProcessing}
                className="w-full py-3.5 bg-amber-600 text-white rounded-xl font-semibold text-base hover:bg-amber-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    AIが読み取り中... ({imagePreviews.length}枚)
                  </>
                ) : (
                  <>
                    <Camera className="w-5 h-5" />
                    AIで読み取る ({imagePreviews.length}枚)
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
                  AIが解析中...
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
  onEdit,
  onSave,
  onUpdateField,
}: {
  index: number;
  data: ExtractedData;
  isEditing: boolean;
  saveStatus: "idle" | "saving" | "saved" | "error";
  onEdit: () => void;
  onSave: () => void;
  onUpdateField: (section: "company" | "contact", field: string, value: string) => void;
}) {
  if (saveStatus === "saved") {
    return (
      <div className="bg-green-50 rounded-2xl border border-green-200 p-4 flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center shrink-0">
          <Check className="w-5 h-5 text-green-600" />
        </div>
        <div>
          <p className="text-sm font-semibold text-green-800">
            {data.company?.name || "企業名なし"} — {data.contact?.last_name || ""}{data.contact?.first_name || ""}
          </p>
          <p className="text-xs text-green-600">登録完了</p>
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
