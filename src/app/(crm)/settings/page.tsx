'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { BookingPage } from '@/types';
import { Save, ExternalLink, Users, Clock } from 'lucide-react';
import Link from 'next/link';

export default function SettingsPage() {
  const [page, setPage] = useState<BookingPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [form, setForm] = useState({
    slug: '',
    company_name: '',
    primary_color: '#2563eb',
    welcome_message: '',
  });

  const supabase = createClient();

  useEffect(() => {
    loadSettings();
    fetch('/api/members/check-admin')
      .then(res => res.json())
      .then(data => setIsAdmin(data.isAdmin === true))
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadSettings() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data } = await supabase
      .from('scheduling_booking_pages')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (data) {
      setPage(data);
      setForm({
        slug: data.slug,
        company_name: data.company_name || '',
        primary_color: data.primary_color,
        welcome_message: data.welcome_message || '',
      });
    } else {
      // Pre-fill slug from email for new users
      const emailPrefix = user?.email?.split('@')[0] || '';
      setForm(prev => ({ ...prev, slug: emailPrefix.toLowerCase().replace(/[^a-z0-9]+/g, '-') }));
    }
    setLoading(false);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSaving(false); return; }

    if (page) {
      // Update existing
      await supabase
        .from('scheduling_booking_pages')
        .update({
          slug: form.slug,
          company_name: form.company_name,
          primary_color: form.primary_color,
          welcome_message: form.welcome_message,
        })
        .eq('id', page.id);
    } else {
      // Create new
      await supabase
        .from('scheduling_booking_pages')
        .insert({
          user_id: user.id,
          slug: form.slug || user.email?.split('@')[0] || 'my-page',
          company_name: form.company_name,
          primary_color: form.primary_color,
          welcome_message: form.welcome_message,
        });
    }

    setSaving(false);
    loadSettings();
  }

  if (loading) return <div className="text-center py-12 text-gray-700">読み込み中...</div>;

  return (
    <div className="space-y-8 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">設定</h1>
        <p className="text-gray-700 mt-1">公開予約ページの設定を管理します</p>
      </div>

      <form onSubmit={handleSave} className="bg-white rounded-xl border border-gray-200 p-6 space-y-6">
        <h2 className="text-lg font-semibold text-gray-900">予約ページ設定</h2>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">公開URL スラッグ</label>
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-600">{typeof window !== 'undefined' ? window.location.origin : ''}/book/</span>
            <input type="text" required value={form.slug}
              onChange={e => setForm({ ...form, slug: e.target.value })}
              className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">会社名 / 組織名</label>
          <input type="text" value={form.company_name}
            onChange={e => setForm({ ...form, company_name: e.target.value })}
            placeholder="例: 株式会社ABC"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">ブランドカラー</label>
          <div className="flex items-center gap-3">
            <input type="color" value={form.primary_color}
              onChange={e => setForm({ ...form, primary_color: e.target.value })}
              className="w-12 h-10 border border-gray-300 rounded-lg cursor-pointer" />
            <input type="text" value={form.primary_color}
              onChange={e => setForm({ ...form, primary_color: e.target.value })}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-32" />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">ウェルカムメッセージ</label>
          <textarea value={form.welcome_message}
            onChange={e => setForm({ ...form, welcome_message: e.target.value })}
            rows={3} placeholder="予約ページに表示するメッセージ"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
        </div>

        <div className="flex items-center gap-3 pt-2">
          <button type="submit" disabled={saving}
            className="flex items-center gap-2 bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors text-sm font-medium">
            <Save className="w-4 h-4" />
            {saving ? '保存中...' : '保存'}
          </button>
          {page && (
            <a href={`/book/${form.slug}`} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-2 text-sm text-blue-600 hover:underline">
              <ExternalLink className="w-4 h-4" /> プレビュー
            </a>
          )}
        </div>
      </form>

      {/* Quick links */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <h2 className="text-lg font-semibold text-gray-900">その他の設定</h2>
        <div className="space-y-2">
          <Link
            href="/availability"
            className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 transition-colors border border-gray-100"
          >
            <div className="w-9 h-9 bg-green-100 rounded-lg flex items-center justify-center">
              <Clock className="w-4 h-4 text-green-600" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-900">空き時間設定</p>
              <p className="text-xs text-gray-500">曜日ごとの空き時間ルールを管理</p>
            </div>
          </Link>
          {isAdmin && (
            <Link
              href="/members"
              className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 transition-colors border border-gray-100"
            >
              <div className="w-9 h-9 bg-purple-100 rounded-lg flex items-center justify-center">
                <Users className="w-4 h-4 text-purple-600" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900">メンバー管理</p>
                <p className="text-xs text-gray-500">メンバーの招待・管理</p>
              </div>
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
