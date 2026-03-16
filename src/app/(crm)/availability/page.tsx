'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { AvailabilityRule, AvailabilityOverride } from '@/types';
import { Plus, Trash2, Save } from 'lucide-react';


const DAY_NAMES = ['日曜日', '月曜日', '火曜日', '水曜日', '木曜日', '金曜日', '土曜日'];

export default function AvailabilityPage() {
  const [rules, setRules] = useState<AvailabilityRule[]>([]);
  const [overrides, setOverrides] = useState<AvailabilityOverride[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [userId, setUserId] = useState<string>('');

  // Override form
  const [overrideDate, setOverrideDate] = useState('');
  const [overrideStart, setOverrideStart] = useState('09:00');
  const [overrideEnd, setOverrideEnd] = useState('17:00');
  const [overrideBlocked, setOverrideBlocked] = useState(false);

  const supabase = createClient();

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setUserId(user.id);

    const [{ data: r }, { data: o }] = await Promise.all([
      supabase.from('scheduling_availability_rules').select('*').eq('user_id', user.id).order('day_of_week').order('start_time'),
      supabase.from('scheduling_availability_overrides').select('*').eq('user_id', user.id).order('date'),
    ]);

    setRules(r || []);
    setOverrides(o || []);
    setLoading(false);
  }

  function addRule(dayOfWeek: number) {
    setRules([...rules, {
      id: `new-${Date.now()}`,
      user_id: userId,
      day_of_week: dayOfWeek,
      start_time: '09:00',
      end_time: '17:00',
      created_at: new Date().toISOString(),
    }]);
  }

  function updateRule(id: string, field: 'start_time' | 'end_time', value: string) {
    setRules(rules.map(r => r.id === id ? { ...r, [field]: value } : r));
  }

  function removeRule(id: string) {
    setRules(rules.filter(r => r.id !== id));
  }

  async function saveRules() {
    setSaving(true);
    // Delete all existing rules and re-insert
    await supabase.from('scheduling_availability_rules').delete().eq('user_id', userId);

    const inserts = rules.map(r => ({
      user_id: userId,
      day_of_week: r.day_of_week,
      start_time: r.start_time,
      end_time: r.end_time,
    }));

    if (inserts.length > 0) {
      await supabase.from('scheduling_availability_rules').insert(inserts);
    }

    await loadData();
    setSaving(false);
  }

  async function addOverride() {
    if (!overrideDate) return;
    await supabase.from('scheduling_availability_overrides').insert({
      user_id: userId,
      date: overrideDate,
      start_time: overrideBlocked ? null : overrideStart,
      end_time: overrideBlocked ? null : overrideEnd,
      is_blocked: overrideBlocked,
    });
    setOverrideDate('');
    loadData();
  }

  async function deleteOverride(id: string) {
    await supabase.from('scheduling_availability_overrides').delete().eq('id', id);
    loadData();
  }

  if (loading) return <div className="text-center py-12 text-gray-700">読み込み中...</div>;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">空き時間設定</h1>
        <p className="text-gray-700 mt-1">予約を受け付ける時間帯を設定します</p>
      </div>

      {/* Weekly Schedule */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-gray-900">週間スケジュール</h2>
          <button onClick={saveRules} disabled={saving}
            className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors text-sm font-medium">
            <Save className="w-4 h-4" />
            {saving ? '保存中...' : '保存'}
          </button>
        </div>

        <div className="space-y-4">
          {[0, 1, 2, 3, 4, 5, 6].map(day => {
            const dayRules = rules.filter(r => r.day_of_week === day);
            return (
              <div key={day} className="flex items-start gap-4 py-3 border-b border-gray-100 last:border-0">
                <div className="w-20 pt-2">
                  <span className={`text-sm font-medium ${dayRules.length > 0 ? 'text-gray-900' : 'text-gray-600'}`}>
                    {DAY_NAMES[day]}
                  </span>
                </div>
                <div className="flex-1 space-y-2">
                  {dayRules.length > 0 ? (
                    dayRules.map(rule => (
                      <div key={rule.id} className="flex items-center gap-2">
                        <input type="time" value={rule.start_time}
                          onChange={e => updateRule(rule.id, 'start_time', e.target.value)}
                          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm" />
                        <span className="text-gray-600">〜</span>
                        <input type="time" value={rule.end_time}
                          onChange={e => updateRule(rule.id, 'end_time', e.target.value)}
                          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm" />
                        <button onClick={() => removeRule(rule.id)}
                          className="p-1 text-gray-500 hover:text-red-500">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-gray-600 py-1.5">受付なし</p>
                  )}
                  <button onClick={() => addRule(day)}
                    className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700">
                    <Plus className="w-3 h-3" /> 時間帯を追加
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Date Overrides */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">特定日の設定</h2>
        <p className="text-sm text-gray-700 mb-4">特定の日に通常のスケジュールを上書きします（休日や特別な営業日など）</p>

        <div className="flex flex-wrap items-end gap-3 mb-6 p-4 bg-gray-50 rounded-lg">
          <div>
            <label className="block text-xs text-gray-700 mb-1">日付</label>
            <input type="date" value={overrideDate}
              onChange={e => setOverrideDate(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm" />
          </div>
          <label className="flex items-center gap-2 pb-1.5">
            <input type="checkbox" checked={overrideBlocked}
              onChange={e => setOverrideBlocked(e.target.checked)}
              className="w-4 h-4 text-blue-600 rounded" />
            <span className="text-sm text-gray-700">終日ブロック</span>
          </label>
          {!overrideBlocked && (
            <>
              <div>
                <label className="block text-xs text-gray-700 mb-1">開始</label>
                <input type="time" value={overrideStart}
                  onChange={e => setOverrideStart(e.target.value)}
                  className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm" />
              </div>
              <div>
                <label className="block text-xs text-gray-700 mb-1">終了</label>
                <input type="time" value={overrideEnd}
                  onChange={e => setOverrideEnd(e.target.value)}
                  className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm" />
              </div>
            </>
          )}
          <button onClick={addOverride} disabled={!overrideDate}
            className="bg-blue-600 text-white px-4 py-1.5 rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm font-medium">
            追加
          </button>
        </div>

        {overrides.length > 0 ? (
          <div className="space-y-2">
            {overrides.map(o => (
              <div key={o.id} className="flex items-center justify-between py-2 px-3 bg-gray-50 rounded-lg">
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium text-gray-900">{o.date}</span>
                  {o.is_blocked ? (
                    <span className="text-xs bg-red-50 text-red-700 px-2 py-0.5 rounded">終日ブロック</span>
                  ) : (
                    <span className="text-xs text-gray-700">{o.start_time} 〜 {o.end_time}</span>
                  )}
                </div>
                <button onClick={() => deleteOverride(o.id)}
                  className="text-gray-500 hover:text-red-500">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-600">特定日の設定はありません</p>
        )}
      </div>
    </div>
  );
}
