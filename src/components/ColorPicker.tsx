'use client';

import { EVENT_TYPE_COLORS } from '@/lib/color-palette';
import { Check } from 'lucide-react';

interface ColorPickerProps {
  value: string;
  onChange: (color: string) => void;
  label?: string;
  hint?: string;
}

export default function ColorPicker({ value, onChange, label, hint }: ColorPickerProps) {
  return (
    <div>
      {label && <label className="block text-sm font-medium text-gray-700 mb-1.5">{label}</label>}
      <div className="flex flex-wrap gap-2">
        {EVENT_TYPE_COLORS.map(color => {
          const isSelected = value.toLowerCase() === color.value.toLowerCase();
          return (
            <button
              key={color.value}
              type="button"
              title={color.label}
              onClick={() => onChange(color.value)}
              className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${
                isSelected
                  ? 'ring-2 ring-offset-2 ring-gray-400 scale-110'
                  : 'hover:scale-110 hover:ring-2 hover:ring-offset-1 hover:ring-gray-300'
              }`}
              style={{ backgroundColor: color.value }}
            >
              {isSelected && <Check className="w-4 h-4 text-white drop-shadow" />}
            </button>
          );
        })}
      </div>
      {hint && <p className="text-[11px] text-gray-500 mt-1.5">{hint}</p>}
    </div>
  );
}
