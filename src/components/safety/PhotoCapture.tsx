"use client"

import { useRef } from "react"
import { Camera, Upload, X, Plus, Loader2 } from "lucide-react"

interface PhotoCaptureProps {
  images: string[]
  onImagesChange: (images: string[]) => void
  maxImages?: number
  isAnalyzing?: boolean
  onAnalyze?: (image: string) => void
}

/**
 * モバイルファーストの写真撮影/アップロードコンポーネント
 * 建設現場での使用を想定し、背面カメラ優先
 */
export default function PhotoCapture({
  images,
  onImagesChange,
  maxImages = 10,
  isAnalyzing = false,
  onAnalyze,
}: PhotoCaptureProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)

  // 画像をリサイズ・圧縮してbase64に変換
  const compressImage = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = (ev) => {
        const img = new Image()
        img.onload = () => {
          const canvas = document.createElement('canvas')
          const maxWidth = 1920
          let width = img.width
          let height = img.height

          if (width > maxWidth) {
            height = (height * maxWidth) / width
            width = maxWidth
          }

          canvas.width = width
          canvas.height = height
          const ctx = canvas.getContext('2d')
          if (!ctx) {
            resolve(ev.target?.result as string)
            return
          }
          ctx.drawImage(img, 0, 0, width, height)
          resolve(canvas.toDataURL('image/jpeg', 0.8))
        }
        img.onerror = reject
        img.src = ev.target?.result as string
      }
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
  }

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files) return

    const remaining = maxImages - images.length
    const filesToRead = Array.from(files).slice(0, remaining)

    for (const file of filesToRead) {
      try {
        const compressed = await compressImage(file)
        onImagesChange([...images, compressed])
        // 撮影後すぐにAI分析を開始
        if (onAnalyze) {
          onAnalyze(compressed)
        }
      } catch (err) {
        console.error('Image compress error:', err)
      }
    }

    // inputをリセット
    e.target.value = ''
  }

  const removeImage = (index: number) => {
    onImagesChange(images.filter((_, i) => i !== index))
  }

  return (
    <div className="space-y-4">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleImageUpload}
        className="hidden"
      />

      {/* 撮影済み画像のプレビュー */}
      {images.length > 0 && (
        <div className="grid grid-cols-2 gap-3">
          {images.map((preview, index) => (
            <div key={index} className="relative rounded-xl overflow-hidden border border-emerald-200 aspect-[4/3]">
              <img src={preview} alt={`現場写真 ${index + 1}`} className="w-full h-full object-cover" />
              <button
                onClick={() => removeImage(index)}
                className="absolute top-1.5 right-1.5 w-7 h-7 bg-black/50 rounded-full flex items-center justify-center text-white hover:bg-black/70 transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
              <div className="absolute bottom-1.5 left-1.5 px-2 py-0.5 bg-black/50 rounded-full text-white text-xs">
                {index + 1}
              </div>
            </div>
          ))}

          {/* 追加撮影ボタン */}
          {images.length < maxImages && !isAnalyzing && (
            <button
              onClick={() => {
                if (fileInputRef.current) {
                  fileInputRef.current.removeAttribute('capture')
                  fileInputRef.current.click()
                }
              }}
              className="rounded-xl border-2 border-dashed border-emerald-300 aspect-[4/3] flex flex-col items-center justify-center gap-2 hover:border-emerald-500 hover:bg-emerald-50/50 transition-all"
            >
              <Plus className="w-8 h-8 text-emerald-400" />
              <span className="text-xs text-emerald-600">追加撮影</span>
            </button>
          )}
        </div>
      )}

      {/* 初期画面：撮影ボタン */}
      {images.length === 0 && (
        <div className="space-y-3">
          <button
            onClick={() => {
              if (fileInputRef.current) {
                fileInputRef.current.setAttribute('capture', 'environment')
                fileInputRef.current.click()
              }
            }}
            disabled={isAnalyzing}
            className="w-full aspect-[4/3] bg-white rounded-2xl border-2 border-dashed border-emerald-300 flex flex-col items-center justify-center gap-3 hover:border-emerald-500 hover:bg-emerald-50/50 transition-all active:scale-[0.98] disabled:opacity-50"
          >
            {isAnalyzing ? (
              <>
                <Loader2 className="w-10 h-10 text-emerald-500 animate-spin" />
                <p className="text-sm text-emerald-700 font-medium">AI分析中...</p>
              </>
            ) : (
              <>
                <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center">
                  <Camera className="w-8 h-8 text-emerald-600" />
                </div>
                <div className="text-center">
                  <p className="font-semibold text-emerald-800">タップして現場を撮影</p>
                  <p className="text-xs text-emerald-600 mt-1">背面カメラで撮影 → AIが即座に分析</p>
                </div>
              </>
            )}
          </button>

          <button
            onClick={() => {
              if (fileInputRef.current) {
                fileInputRef.current.removeAttribute('capture')
                fileInputRef.current.click()
              }
            }}
            disabled={isAnalyzing}
            className="w-full py-3.5 bg-white rounded-xl border border-emerald-200 text-emerald-700 font-medium flex items-center justify-center gap-2 hover:bg-emerald-50 transition-colors active:scale-[0.98] disabled:opacity-50"
          >
            <Upload className="w-4 h-4" />
            ライブラリから選択
          </button>
        </div>
      )}
    </div>
  )
}
