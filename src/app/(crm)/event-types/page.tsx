'use client';

import { useEffect, useState, Suspense } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useManagedUser } from '@/lib/use-managed-user';
import type { EventType } from '@/types';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Plus, Edit, Trash2, Copy, ExternalLink, X, Calendar, Check } from 'lucide-react';
import ColorPicker from '@/components/ColorPicker';
import { getNextAvailableColor } from '@/lib/color-palette';

function EventTypesPageContent() {
  const managedUserId = useManagedUser();
  const [eventTypes, setEventTypes] = useState<EventType[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [bookingPageSlug, setBookingPageSlug] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: '',
    slug: '',
    description: '',
    duration_minutes: 30,
    location_type: 'online' as 'online' | 'offline' | 'both',
    offline_location: '',
    buffer_before_minutes: 0,
    buffer_after_minutes: 0,
    color: '#2563eb',
    is_active: true,
  });

  const supabase = createClient();

  useEffect(() => {
    loadData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [managedUserId]);

  const [currentUserId, setCurrentUserId] = useState<string>('');
  const [userNameMap, setUserNameMap] = useState<Record<string, string>>({});
  const [bookingPageSlugs, setBookingPageSlugs] = useState<Record<string, string>>({});

  async function loadData() {
    try {
      const res = await fetch('/api/event-types');
      const data = await res.json();
      if (data.error) return;

      setCurrentUserId(data.currentUserId);
      setUserNameMap(data.userNameMap || {});
      setEventTypes(data.eventTypes || []);
      setBookingPageSlugs(data.bookingPageSlugs || {});
      // Keep backward compat
      const targetUserId = managedUserId || data.currentUserId;
      setBookingPageSlug(data.bookingPageSlugs?.[targetUserId] || '');
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }

  function resetForm() {
    const usedColors = eventTypes.map(et => et.color);
    setForm({
      name: '', slug: '', description: '', duration_minutes: 30,
      location_type: 'online', offline_location: '', buffer_before_minutes: 0,
      buffer_after_minutes: 0, color: getNextAvailableColor(usedColors), is_active: true,
    });
    setEditingId(null);
    setShowForm(false);
  }

  // Edit now handled via /event-types/[id]/edit page

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const payload = {
      ...form,
      user_id: managedUserId || user.id,
      slug: form.slug || form.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''),
    };

    if (editingId) {
      await supabase.from('scheduling_event_types').update(payload).eq('id', editingId);
    } else {
      await supabase.from('scheduling_event_types').insert(payload);
    }

    resetForm();
    loadData();
  }

  async function handleDelete(id: string) {
    if (!confirm('この予約リンクを削除しますか？')) return;
    await supabase.from('scheduling_event_types').delete().eq('id', id);
    loadData();
  }

  async function toggleActive(et: EventType) {
    await supabase.from('scheduling_event_types').update({ is_active: !et.is_active }).eq('id', et.id);
    loadData();
  }

  function getBookingUrl(et: EventType) {
    if (typeof window === 'undefined') return '';
    const slug = bookingPageSlugs[et.user_id] || bookingPageSlug;
    return `${window.location.origin}/book/${slug}/${et.slug}`;
  }

  function copyUrl(et: EventType) {
    const url = getBookingUrl(et);
    if (!url || !bookingPageSlug) {
      alert('予約ページが未設定です。設定ページでスラッグを設定してください。');
      return;
    }
    // Use textarea fallback which is most reliable across browsers
    const textarea = document.createElement('textarea');
    textarea.value = url;
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    try {
      document.execCommand('copy');
      setCopiedId(et.id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      // If execCommand fails, try clipboard API
      navigator.clipboard?.writeText(url).then(() => {
        setCopiedId(et.id);
        setTimeout(() => setCopiedId(null), 2000);
      }).catch(() => {
        alert('コピーに失敗しました。URLを手動でコピーしてください。');
      });
    } finally {
      document.body.removeChild(textarea);
    }
  }

  if (loading) return <div className="text-center py-12 text-gray-700">読み込み中...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">予約リンク一覧</h1>
          <p className="text-gray-700 mt-1">予約リンクの管理と共有</p>
        </div>
        <Link href={`/event-types/new${managedUserId ? `?managedUser=${managedUserId}` : ''}`}
          className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium">
          <Plus className="w-4 h-4" />
          新規作成
        </Link>
      </div>

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b">
              <h2 className="text-lg font-semibold">{editingId ? '予約リンクを編集' : '予約リンクを作成'}</h2>
              <button onClick={resetForm} className="text-gray-500 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">名前 *</label>
                <input type="text" required value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                  placeholder="例: 30分オンライン面談"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">URL スラッグ</label>
                <input type="text" value={form.slug}
                  onChange={e => setForm({ ...form, slug: e.target.value })}
                  placeholder="自動生成（例: online-30min）"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">説明</label>
                <textarea value={form.description}
                  onChange={e => setForm({ ...form, description: e.target.value })}
                  rows={2} placeholder="予約者に表示される説明文"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">所要時間（分）</label>
                  <select value={form.duration_minutes}
                    onChange={e => setForm({ ...form, duration_minutes: Number(e.target.value) })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
                    <option value={15}>15分</option>
                    <option value={30}>30分</option>
                    <option value={45}>45分</option>
                    <option value={60}>60分</option>
                    <option value={90}>90分</option>
                    <option value={120}>120分</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">場所</label>
                  <select value={form.location_type}
                    onChange={e => setForm({ ...form, location_type: e.target.value as 'online' | 'offline' | 'both' })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
                    <option value="online">オンライン（Google Meet）</option>
                    <option value="offline">オフライン（対面）</option>
                    <option value="both">選択可</option>
                  </select>
                </div>
              </div>

              {(form.location_type === 'offline' || form.location_type === 'both') && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">オフライン場所</label>
                  <input type="text" value={form.offline_location}
                    onChange={e => setForm({ ...form, offline_location: e.target.value })}
                    placeholder="住所や会議室名"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">前バッファ（分）</label>
                  <select value={form.buffer_before_minutes}
                    onChange={e => setForm({ ...form, buffer_before_minutes: Number(e.target.value) })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
                    <option value={0}>なし</option>
                    <option value={5}>5分</option>
                    <option value={10}>10分</option>
                    <option value={15}>15分</option>
                    <option value={30}>30分</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">後バッファ（分）</label>
                  <select value={form.buffer_after_minutes}
                    onChange={e => setForm({ ...form, buffer_after_minutes: Number(e.target.value) })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
                    <option value={0}>なし</option>
                    <option value={5}>5分</option>
                    <option value={10}>10分</option>
                    <option value={15}>15分</option>
                    <option value={30}>30分</option>
                  </select>
                </div>
              </div>

              <ColorPicker
                value={form.color}
                onChange={color => setForm({ ...form, color })}
                label="カラー"
              />

              <div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={form.is_active}
                    onChange={e => setForm({ ...form, is_active: e.target.checked })}
                    className="w-4 h-4 text-blue-600 rounded" />
                  <span className="text-sm text-gray-700">公開する</span>
                </label>
              </div>

              <div className="flex gap-3 pt-4">
                <button type="submit"
                  className="flex-1 bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium">
                  {editingId ? '更新' : '作成'}
                </button>
                <button type="button" onClick={resetForm}
                  className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors text-sm">
                  キャンセル
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Event Types List */}
      {eventTypes.length > 0 ? (
        <div className="space-y-3">
          {eventTypes.map(et => (
            <div key={et.id} className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3">
                  <div className="w-4 h-4 rounded-full mt-1" style={{ backgroundColor: et.color }} />
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-medium text-gray-900">{et.name}</h3>
                      {et.user_id !== currentUserId && userNameMap[et.user_id] && (
                        <span className="text-xs px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded">
                          {userNameMap[et.user_id]}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-700 mt-0.5">{et.description || '説明なし'}</p>
                    <div className="flex items-center gap-3 mt-2 text-xs text-gray-600">
                      <span>{et.duration_minutes}分</span>
                      <span>{et.location_type === 'online' ? 'オンライン' : et.location_type === 'offline' ? 'オフライン' : '選択可'}</span>
                      {et.buffer_before_minutes > 0 && <span>前{et.buffer_before_minutes}分</span>}
                      {et.buffer_after_minutes > 0 && <span>後{et.buffer_after_minutes}分</span>}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs px-2 py-1 rounded-full cursor-pointer ${et.is_active ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-700'}`}
                    onClick={() => toggleActive(et)} role="button">
                    {et.is_active ? '公開中' : '非公開'}
                  </span>
                  <button onClick={() => copyUrl(et)} className={`p-1.5 rounded-lg transition-colors ${copiedId === et.id ? 'text-green-600 bg-green-50' : 'text-gray-500 hover:text-gray-800 hover:bg-gray-100'}`} title="URLをコピー">
                    {copiedId === et.id ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  </button>
                  <a href={getBookingUrl(et)} target="_blank" rel="noopener noreferrer" className="p-1.5 text-gray-500 hover:text-gray-600 hover:bg-gray-100 rounded-lg" title="予約ページを開く">
                    <ExternalLink className="w-4 h-4" />
                  </a>
                  <Link href={`/event-types/${et.id}/edit${managedUserId ? `?managedUser=${managedUserId}` : ''}`} className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg" title="編集">
                    <Edit className="w-4 h-4" />
                  </Link>
                  <button onClick={() => handleDelete(et.id)} className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg" title="削除">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
              {et.is_active && (bookingPageSlugs[et.user_id] || bookingPageSlug) && (
                <div className="mt-3 pt-3 border-t border-gray-100">
                  <p className="text-xs text-gray-600">予約URL:</p>
                  <code className="text-xs text-blue-600 break-all">{getBookingUrl(et)}</code>
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <Calendar className="w-12 h-12 text-gray-400 mx-auto mb-3" />
          <p className="text-gray-700">予約リンクがまだありません</p>
          <p className="text-sm text-gray-600 mt-1">「新規作成」ボタンから作成してください</p>
        </div>
      )}
    </div>
  );
}

export default function EventTypesPage() {
  return (
    <Suspense fallback={<div className="flex justify-center items-center h-64">読み込み中...</div>}>
      <EventTypesPageContent />
    </Suspense>
  );
}
