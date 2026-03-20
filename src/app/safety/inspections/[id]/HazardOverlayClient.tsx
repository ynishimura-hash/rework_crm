"use client"

import { useState } from "react"
import HazardOverlay from "@/components/safety/HazardOverlay"
import HazardCard from "@/components/safety/HazardCard"
import type { SafetyHazard } from "@/lib/gemini-safety"

interface HazardOverlayClientProps {
  imageUrl: string
  hazards: SafetyHazard[]
}

/**
 * 点検結果詳細ページ用のクライアントラッパー
 * HazardOverlay + HazardCard のインタラクションを管理
 */
export default function HazardOverlayClient({ imageUrl, hazards }: HazardOverlayClientProps) {
  const [selectedIndex, setSelectedIndex] = useState<number | undefined>()

  return (
    <div className="space-y-2">
      <HazardOverlay
        imageUrl={imageUrl}
        hazards={hazards}
        selectedIndex={selectedIndex}
        onSelectHazard={setSelectedIndex}
      />
      <div className="space-y-2">
        {hazards.map((hazard, index) => (
          <HazardCard
            key={index}
            hazard={hazard}
            index={index}
            isSelected={selectedIndex === index}
            onSelect={() => setSelectedIndex(index)}
          />
        ))}
      </div>
    </div>
  )
}
