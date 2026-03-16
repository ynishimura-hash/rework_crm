'use client';

import { useState, useEffect, useCallback } from 'react';
import type { BookingPage, EventType, User, TimeSlot } from '@/types';
import { format, addDays, startOfDay, isSameDay } from 'date-fns';
import { ja } from 'date-fns/locale';
import { Clock, Video, MapPin, ChevronLeft, ChevronRight, Check, Loader2 } from 'lucide-react';

interface Props {
  bookingPage: BookingPage;
  eventTypes: EventType[];
  hostUser: Pick<User, 'id' | 'name' | 'avatar_url'> | null;
}

type Step = 'select-type' | 'select-slot' | 'form' | 'confirmed';

interface DaySlots {
  date: Date;
  slots: TimeSlot[];
  loading: boolean;
}

export default function BookingPageClient({ bookingPage, eventTypes, hostUser }: Props) {
  const [step, setStep] = useState<Step>('select-type');
  const [selectedEventType, setSelectedEventType] = useState<EventType | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<TimeSlot | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [locationType, setLocationType] = useState<'online' | 'offline'>('online');
  const [submitting, setSubmitting] = useState(false);
  const [weekOffset, setWeekOffset] = useState(0);
  const [weekSlots, setWeekSlots] = useState<DaySlots[]>([]);

  const [formData, setFormData] = useState({ name: '', email: '', notes: '' });
  const [confirmedBooking, setConfirmedBooking] = useState<Record<string, string> | null>(null);

  const primaryColor = bookingPage.primary_color || '#2563eb';
  const today = startOfDay(new Date());

  // Auto-select if only one event type (e.g., direct link)
  useEffect(() => {
    if (eventTypes.length === 1) {
      selectEventType(eventTypes[0]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fetch availability for all 7 days when week changes or event type selected
  const fetchWeekSlots = useCallback(async (et: EventType, offset: number) => {
    if (!hostUser) return;
    const weekStart = addDays(today, offset * 7);
    const dates = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

    // Initialize with loading state
    setWeekSlots(dates.map(d => ({ date: d, slots: [], loading: true })));

    // Fetch all 7 days in parallel
    const results = await Promise.all(
      dates.map(async (date) => {
        try {
          const res = await fetch(
            `/api/availability?userId=${hostUser.id}&eventTypeId=${et.id}&date=${format(date, 'yyyy-MM-dd')}`
          );
          const data = await res.json();
          return { date, slots: data.slots || [], loading: false };
        } catch {
          return { date, slots: [], loading: false };
        }
      })
    );
    setWeekSlots(results);
  }, [hostUser, today]);

  function selectEventType(et: EventType) {
    setSelectedEventType(et);
    setLocationType(et.location_type === 'both' ? 'online' : et.location_type);
    setStep('select-slot');
    fetchWeekSlots(et, weekOffset);
  }

  function handleWeekChange(newOffset: number) {
    setWeekOffset(newOffset);
    if (selectedEventType) {
      fetchWeekSlots(selectedEventType, newOffset);
    }
  }

  function selectSlot(slot: TimeSlot, date: Date) {
    setSelectedSlot(slot);
    setSelectedDate(date);
    setStep('form');
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedEventType || !selectedSlot) return;
    setSubmitting(true);

    const res = await fetch('/api/bookings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        eventTypeId: selectedEventType.id,
        startTime: selectedSlot.start,
        endTime: selectedSlot.end,
        guestName: formData.name,
        guestEmail: formData.email,
        guestNotes: formData.notes,
        locationType,
      }),
    });

    const data = await res.json();
    setConfirmedBooking(data.booking);
    setStep('confirmed');
    setSubmitting(false);
  }

  const weekStart = addDays(today, weekOffset * 7);
  const weekEnd = addDays(weekStart, 6);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="border-b bg-white">
        <div className="max-w-4xl mx-auto px-4 py-5">
          <div className="flex items-center gap-4">
            {hostUser?.avatar_url && (
              <img src={hostUser.avatar_url} alt="" className="w-10 h-10 rounded-full" />
            )}
            <h1 className="text-lg font-bold text-gray-900">
              {bookingPage.company_name || hostUser?.name || '予約'}
            </h1>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-6">
        {/* Step 1: Select Event Type */}
        {step === 'select-type' && (
          <div className="max-w-xl mx-auto">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">予約タイプを選択</h2>
            <div className="space-y-3">
              {eventTypes.map(et => (
                <button key={et.id} onClick={() => selectEventType(et)}
                  className="w-full text-left bg-white rounded-xl border-2 border-gray-200 hover:border-blue-300 p-5 transition-colors">
                  <div className="flex items-start gap-3">
                    <div className="w-3 h-3 rounded-full mt-1.5" style={{ backgroundColor: et.color }} />
                    <div>
                      <h3 className="font-medium text-gray-900">{et.name}</h3>
                      {et.description && <p className="text-sm text-gray-700 mt-0.5">{et.description}</p>}
                      <div className="flex items-center gap-3 mt-2">
                        <span className="flex items-center gap-1 text-xs text-gray-600">
                          <Clock className="w-3 h-3" /> {et.duration_minutes}分
                        </span>
                        <span className="flex items-center gap-1 text-xs text-gray-600">
                          {et.location_type === 'online' ? <><Video className="w-3 h-3" /> オンライン</> :
                           et.location_type === 'offline' ? <><MapPin className="w-3 h-3" /> オフライン</> :
                           '選択可'}
                        </span>
                      </div>
                    </div>
                  </div>
                </button>
              ))}
              {eventTypes.length === 0 && (
                <p className="text-center text-gray-700 py-12">現在予約可能なタイプがありません</p>
              )}
            </div>
          </div>
        )}

        {/* Step 2: Calendar view — dates + time slots at once */}
        {step === 'select-slot' && selectedEventType && (
          <div>
            {/* Event type info bar */}
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3">
                {eventTypes.length > 1 && (
                  <button onClick={() => setStep('select-type')}
                    className="p-1 text-gray-400 hover:text-gray-600">
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                )}
                <div>
                  <h2 className="font-semibold text-gray-900">{selectedEventType.name}</h2>
                  <p className="text-xs text-gray-600 flex items-center gap-2 mt-0.5">
                    <Clock className="w-3 h-3" /> {selectedEventType.duration_minutes}分
                    {selectedEventType.location_type === 'online' && <><Video className="w-3 h-3 ml-1" /> オンライン</>}
                  </p>
                </div>
              </div>
            </div>

            {/* Week navigation */}
            <div className="flex items-center justify-between mb-4">
              <button onClick={() => handleWeekChange(Math.max(0, weekOffset - 1))}
                disabled={weekOffset === 0}
                className="p-2 rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-100 disabled:opacity-30 transition-colors">
                <ChevronLeft className="w-5 h-5" />
              </button>
              <span className="text-sm font-medium text-gray-700">
                {format(weekStart, 'M月d日', { locale: ja })} 〜 {format(weekEnd, 'M月d日', { locale: ja })}
              </span>
              <button onClick={() => handleWeekChange(weekOffset + 1)}
                className="p-2 rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors">
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>

            {/* Calendar grid — 7 days with slots */}
            <div className="grid grid-cols-7 gap-2">
              {weekSlots.map(dayData => {
                const isToday = isSameDay(dayData.date, today);
                const isSun = dayData.date.getDay() === 0;
                const isSat = dayData.date.getDay() === 6;
                const dayColor = isSun ? 'text-red-500' : isSat ? 'text-blue-500' : 'text-gray-700';
                return (
                  <div key={dayData.date.toISOString()} className="min-h-[120px]">
                    {/* Day header */}
                    <div className={`text-center py-2 mb-1 rounded-lg ${isToday ? 'bg-blue-50' : ''}`}>
                      <p className={`text-xs ${dayColor}`}>{format(dayData.date, 'E', { locale: ja })}</p>
                      <p className={`text-base font-semibold ${isToday ? 'text-blue-600' : dayColor}`}>
                        {format(dayData.date, 'd')}
                      </p>
                    </div>
                    {/* Slots */}
                    <div className="space-y-1">
                      {dayData.loading ? (
                        <div className="flex justify-center py-4">
                          <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
                        </div>
                      ) : dayData.slots.length > 0 ? (
                        dayData.slots.map(slot => (
                          <button key={slot.start} onClick={() => selectSlot(slot, dayData.date)}
                            className="w-full text-center py-1.5 text-xs font-medium rounded-lg border border-gray-200 bg-white text-gray-800 hover:border-blue-400 hover:bg-blue-50 hover:text-blue-700 transition-colors">
                            {format(new Date(slot.start), 'HH:mm')}
                          </button>
                        ))
                      ) : (
                        <p className="text-center text-[10px] text-gray-400 py-2">—</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Step 3: Booking Form */}
        {step === 'form' && selectedSlot && selectedEventType && selectedDate && (
          <div className="max-w-lg mx-auto">
            <button onClick={() => setStep('select-slot')}
              className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4">
              <ChevronLeft className="w-4 h-4" /> 戻る
            </button>

            <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6">
              <p className="text-sm font-medium text-gray-900">{selectedEventType.name}</p>
              <p className="text-sm text-gray-700 mt-1">
                {format(selectedDate, 'yyyy年M月d日(E)', { locale: ja })} {format(new Date(selectedSlot.start), 'HH:mm')} 〜 {format(new Date(selectedSlot.end), 'HH:mm')}
              </p>
            </div>

            <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
              <h2 className="text-lg font-semibold text-gray-900">予約情報を入力</h2>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">お名前 *</label>
                <input type="text" required value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">メールアドレス *</label>
                <input type="email" required value={formData.email}
                  onChange={e => setFormData({ ...formData, email: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
              </div>

              {selectedEventType.location_type === 'both' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">参加方法</label>
                  <div className="flex gap-3">
                    <label className={`flex-1 flex items-center gap-2 p-3 rounded-lg border-2 cursor-pointer transition-colors ${
                      locationType === 'online' ? 'border-blue-500 bg-blue-50' : 'border-gray-200'
                    }`}>
                      <input type="radio" name="location" value="online" checked={locationType === 'online'}
                        onChange={() => setLocationType('online')} className="sr-only" />
                      <Video className="w-4 h-4" /> <span className="text-sm">オンライン</span>
                    </label>
                    <label className={`flex-1 flex items-center gap-2 p-3 rounded-lg border-2 cursor-pointer transition-colors ${
                      locationType === 'offline' ? 'border-blue-500 bg-blue-50' : 'border-gray-200'
                    }`}>
                      <input type="radio" name="location" value="offline" checked={locationType === 'offline'}
                        onChange={() => setLocationType('offline')} className="sr-only" />
                      <MapPin className="w-4 h-4" /> <span className="text-sm">対面</span>
                    </label>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">メモ（任意）</label>
                <textarea value={formData.notes}
                  onChange={e => setFormData({ ...formData, notes: e.target.value })}
                  rows={3} placeholder="事前に伝えたいことがあればご記入ください"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
              </div>

              <button type="submit" disabled={submitting}
                style={{ backgroundColor: primaryColor }}
                className="w-full text-white py-3 rounded-lg hover:opacity-90 disabled:opacity-50 transition-all text-sm font-medium">
                {submitting ? '予約を確定中...' : '予約を確定する'}
              </button>
            </form>
          </div>
        )}

        {/* Step 4: Confirmed */}
        {step === 'confirmed' && confirmedBooking && selectedEventType && selectedSlot && selectedDate && (
          <div className="max-w-lg mx-auto text-center">
            <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4"
              style={{ backgroundColor: primaryColor + '20' }}>
              <Check className="w-8 h-8" style={{ color: primaryColor }} />
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">予約が確定しました</h2>
            <p className="text-gray-700 mb-6">確認メールをお送りしました</p>

            <div className="bg-white rounded-xl border border-gray-200 p-6 text-left">
              <dl className="space-y-3">
                <div>
                  <dt className="text-xs text-gray-700">予約タイプ</dt>
                  <dd className="text-sm font-medium text-gray-900">{selectedEventType.name}</dd>
                </div>
                <div>
                  <dt className="text-xs text-gray-700">日時</dt>
                  <dd className="text-sm font-medium text-gray-900">
                    {format(selectedDate, 'yyyy年M月d日(E)', { locale: ja })} {format(new Date(selectedSlot.start), 'HH:mm')} 〜 {format(new Date(selectedSlot.end), 'HH:mm')}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-gray-700">場所</dt>
                  <dd className="text-sm font-medium text-gray-900">
                    {confirmedBooking.location_type === 'online' ? 'オンライン（Google Meet）' : 'オフライン'}
                  </dd>
                </div>
                {confirmedBooking.meeting_url && (
                  <div>
                    <dt className="text-xs text-gray-700">ミーティングURL</dt>
                    <dd>
                      <a href={confirmedBooking.meeting_url} target="_blank" rel="noopener noreferrer"
                        className="text-sm text-blue-600 hover:underline break-all">
                        {confirmedBooking.meeting_url}
                      </a>
                    </dd>
                  </div>
                )}
              </dl>
            </div>

            {confirmedBooking.manage_token && (
              <div className="mt-6 p-4 bg-gray-50 rounded-xl text-left">
                <p className="text-sm text-gray-600 mb-2">予約の変更・キャンセル</p>
                <a
                  href={`/booking/manage/${confirmedBooking.manage_token}`}
                  className="text-sm text-blue-600 hover:underline"
                >
                  予約の管理ページを開く
                </a>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
