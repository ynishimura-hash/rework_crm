'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Booking } from '@/types';
import { format } from 'date-fns';
import { ja } from 'date-fns/locale';
import { Calendar, Video, MapPin } from 'lucide-react';

export default function BookingsPage() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'upcoming' | 'past' | 'cancelled'>('upcoming');

  const supabase = createClient();

  useEffect(() => { loadBookings(); }, [filter]);

  async function loadBookings() {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    let query = supabase
      .from('scheduling_bookings')
      .select('*, scheduling_event_types(*)')
      .eq('host_user_id', user.id);

    if (filter === 'upcoming') {
      query = query.gte('start_time', new Date().toISOString()).eq('status', 'confirmed').order('start_time', { ascending: true });
    } else if (filter === 'past') {
      query = query.lt('start_time', new Date().toISOString()).neq('status', 'cancelled').order('start_time', { ascending: false });
    } else {
      query = query.eq('status', 'cancelled').order('start_time', { ascending: false });
    }

    const { data } = await query.limit(50);
    setBookings(data || []);
    setLoading(false);
  }

  async function cancelBooking(id: string) {
    if (!confirm('この予約をキャンセルしますか？')) return;
    await supabase.from('scheduling_bookings').update({ status: 'cancelled' }).eq('id', id);
    loadBookings();
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">予約一覧</h1>
        <p className="text-gray-700 mt-1">すべての予約を管理します</p>
      </div>

      <div className="flex gap-2">
        {(['upcoming', 'past', 'cancelled'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              filter === f ? 'bg-blue-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}>
            {f === 'upcoming' ? '今後の予約' : f === 'past' ? '過去の予約' : 'キャンセル済み'}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-700">読み込み中...</div>
      ) : bookings.length > 0 ? (
        <div className="space-y-3">
          {bookings.map(booking => {
            const start = new Date(booking.start_time);
            const end = new Date(booking.end_time);
            return (
              <div key={booking.id} className={`bg-white rounded-xl border p-5 ${booking.status === 'cancelled' ? 'border-red-200 opacity-60' : 'border-gray-200'}`}>
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-4">
                    <div className="text-center bg-gray-50 rounded-lg px-3 py-2 min-w-[70px]">
                      <p className="text-xs text-gray-700">{format(start, 'M月d日', { locale: ja })}</p>
                      <p className="text-xs text-gray-600">{format(start, '(E)', { locale: ja })}</p>
                      <p className="text-lg font-bold text-gray-900">{format(start, 'HH:mm')}</p>
                      <p className="text-xs text-gray-600">〜 {format(end, 'HH:mm')}</p>
                    </div>
                    <div>
                      <h3 className="font-medium text-gray-900">{booking.guest_name}</h3>
                      <p className="text-sm text-gray-700">{booking.guest_email}</p>
                      <p className="text-sm text-gray-600 mt-1">{booking.scheduling_event_types?.name}</p>
                      {booking.guest_notes && (
                        <p className="text-sm text-gray-600 mt-1 italic">「{booking.guest_notes}」</p>
                      )}
                      <div className="flex items-center gap-2 mt-2">
                        {booking.location_type === 'online' ? (
                          <span className="flex items-center gap-1 text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded">
                            <Video className="w-3 h-3" /> オンライン
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-xs bg-orange-50 text-orange-700 px-2 py-0.5 rounded">
                            <MapPin className="w-3 h-3" /> オフライン
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {booking.meeting_url && booking.status === 'confirmed' && (
                      <a href={booking.meeting_url} target="_blank" rel="noopener noreferrer"
                        className="text-xs bg-green-50 text-green-700 px-3 py-1.5 rounded-lg hover:bg-green-100 font-medium">
                        Meet参加
                      </a>
                    )}
                    {booking.status === 'confirmed' && filter === 'upcoming' && (
                      <button onClick={() => cancelBooking(booking.id)}
                        className="text-xs bg-red-50 text-red-600 px-3 py-1.5 rounded-lg hover:bg-red-100 font-medium">
                        キャンセル
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <Calendar className="w-12 h-12 text-gray-400 mx-auto mb-3" />
          <p className="text-gray-700">
            {filter === 'upcoming' ? '今後の予約はありません' : filter === 'past' ? '過去の予約はありません' : 'キャンセルされた予約はありません'}
          </p>
        </div>
      )}
    </div>
  );
}
