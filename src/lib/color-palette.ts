/**
 * Shared color palette for event types.
 * 10 distinct, visually balanced colors.
 */
export const EVENT_TYPE_COLORS = [
  { value: '#2563eb', label: 'ブルー' },
  { value: '#7c3aed', label: 'パープル' },
  { value: '#db2777', label: 'ピンク' },
  { value: '#dc2626', label: 'レッド' },
  { value: '#ea580c', label: 'オレンジ' },
  { value: '#d97706', label: 'アンバー' },
  { value: '#16a34a', label: 'グリーン' },
  { value: '#0d9488', label: 'ティール' },
  { value: '#0891b2', label: 'シアン' },
  { value: '#475569', label: 'スレート' },
] as const;

export const DEFAULT_COLOR = EVENT_TYPE_COLORS[0].value;

/**
 * Returns the first color from the palette that isn't already used.
 * Falls back to the first color if all are taken.
 */
export function getNextAvailableColor(usedColors: string[]): string {
  const normalizedUsed = usedColors.map(c => c.toLowerCase());
  const available = EVENT_TYPE_COLORS.find(
    c => !normalizedUsed.includes(c.value.toLowerCase())
  );
  return available?.value ?? DEFAULT_COLOR;
}
