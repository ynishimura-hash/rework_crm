'use client';

import { useState, useEffect, useCallback, useRef, Suspense } from 'react';
import { format, addDays, addMonths, parseISO, isSameDay, isSameMonth, startOfMonth, startOfWeek, endOfWeek, endOfMonth } from 'date-fns';
import { ja } from 'date-fns/locale';
import {
  ChevronLeft, ChevronRight, X, Check, Ban, Plus, Eye, EyeOff,
  CheckSquare, Square, Filter, Video, MapPin, Pencil, Trash2, ExternalLink,
  PanelLeftClose, PanelLeftOpen, CalendarClock, Camera, Image, Type, Clock, Minus,
  Copy, Send, Loader2, Menu, Link2, List, Settings, LogOut, Mail, Bell, Share2, FileText
} from 'lucide-react';
import { useManagedUser } from '@/lib/use-managed-user';
import { createClient } from '@/lib/supabase/client';
import { isJapaneseHoliday } from '@/lib/japanese-holidays';
import CommentSection from '@/components/CommentSection';

// ─── Interfaces ───────────────────────────────────────────

interface CalendarEvent {
  id: string;
  summary: string;
  description?: string;
  start: string;
  end: string;
  allDay: boolean;
  allowOverlap: boolean;
  location?: string;
  meetLink?: string;
  htmlLink?: string;
  attendees?: string[];
  isOrganizer?: boolean; // true if current user is the organizer
  transparency?: 'opaque' | 'transparent'; // opaque=busy, transparent=free
  recurringEventId?: string | null;
  attachments?: Array<{ url: string; title: string; mimeType: string }>;
}

interface AvailabilityWindow {
  start: string;
  end: string;
  dayOfWeek: number;
}

interface BookingEventType {
  id: string;
  name: string;
  slug: string;
  color: string;
  duration_minutes: number;
  is_active: boolean;
  user_id?: string;
  owner_name?: string;
  is_own?: boolean;
}

interface Booking {
  id: string;
  event_type_id: string;
  guest_name: string;
  guest_email: string;
  start_time: string;
  end_time: string;
  status: string;
  location_type: string;
  meeting_url: string | null;
}

interface CalendarSource {
  id: string;
  name: string;
  color: string;
  type: 'google' | 'booking' | 'member';
  visible: boolean;
}

interface TeamMember {
  id: string;
  name: string;
  email: string;
  avatar_url?: string;
}

const MEMBER_COLORS = ['#8b5cf6', '#ec4899', '#f97316', '#14b8a6', '#6366f1', '#84cc16'];

interface CacheEntry {
  events: CalendarEvent[];
  availabilityWindows: AvailabilityWindow[];
  bookingEventTypes: BookingEventType[];
  bookings: Booking[];
  memberEvents: Record<string, CalendarEvent[]>;
  rangeStart: string;
  rangeEnd: string;
  fetchedAt: number;
  userId: string; // Cache key includes managed user to prevent stale data on switch
  memberCount: number; // Invalidate cache when team members change
}

// ─── Constants ────────────────────────────────────────────

const END_HOUR = 24;
const DEFAULT_SCROLL_HOUR = 7; // Scroll to 7:00 by default
const CACHE_STORAGE_KEY = 'calendar_cache_v1';

// Persist cache to sessionStorage so it survives page navigation
function saveCacheToStorage(cache: CacheEntry) {
  try {
    sessionStorage.setItem(CACHE_STORAGE_KEY, JSON.stringify(cache));
  } catch { /* ignore quota errors */ }
}

function loadCacheFromStorage(): CacheEntry | null {
  try {
    const raw = sessionStorage.getItem(CACHE_STORAGE_KEY);
    if (!raw) return null;
    const cache: CacheEntry = JSON.parse(raw);
    // Accept cache up to 5 minutes old for instant display
    if (Date.now() - cache.fetchedAt > 300000) return null;
    return cache;
  } catch {
    return null;
  }
}

function clearCacheStorage() {
  try { sessionStorage.removeItem(CACHE_STORAGE_KEY); } catch { /* */ }
}

// ─── Meeting Notes Component ──────────────────────────────

function MeetingNotes({ eventId, googleAttachments }: { eventId: string; googleAttachments?: Array<{ url: string; title: string; mimeType: string }> }) {
  const [notesUrl, setNotesUrl] = useState<string>('');
  const [savedUrl, setSavedUrl] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  // Filter Google-attached docs (transcripts, meeting notes)
  const googleDocs = (googleAttachments || []).filter(a =>
    a.mimeType?.includes('document') || a.url?.includes('docs.google.com')
  );

  useEffect(() => {
    if (!eventId || eventId.startsWith('temp-')) { setLoading(false); return; }
    fetch(`/api/event-attachments?eventId=${eventId}&type=meeting_notes`)
      .then(r => r.json())
      .then(d => {
        const notes = d.attachments || [];
        if (notes.length > 0) {
          try {
            const content = JSON.parse(notes[0].file_url);
            setSavedUrl(content.url || '');
            setNotesUrl(content.url || '');
          } catch {
            setSavedUrl(notes[0].file_url);
            setNotesUrl(notes[0].file_url);
          }
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [eventId]);

  const handleSave = async () => {
    if (!notesUrl.trim()) return;
    setSaving(true);
    try {
      await fetch('/api/event-attachments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventId,
          type: 'meeting_notes',
          url: notesUrl.trim(),
        }),
      });
      setSavedUrl(notesUrl.trim());
      setEditing(false);
    } catch {} finally {
      setSaving(false);
    }
  };

  if (loading && googleDocs.length === 0) return null;

  const hasContent = savedUrl || googleDocs.length > 0;

  return (
    <div className="border-t border-gray-100 pt-2">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-medium text-gray-500 flex items-center gap-1">
          <FileText className="w-3.5 h-3.5" /> 議事録・ドキュメント
        </span>
        {!editing && (
          <button onClick={() => setEditing(true)}
            className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-0.5">
            <Plus className="w-3 h-3" /> {savedUrl ? '編集' : '追加'}
          </button>
        )}
      </div>
      {/* Google Calendar auto-attached docs (transcripts, notes) */}
      {googleDocs.length > 0 && (
        <div className="space-y-1 mb-1">
          {googleDocs.map((doc, i) => (
            <a key={i} href={doc.url} target="_blank" rel="noopener noreferrer"
              className="text-xs text-green-700 hover:text-green-900 hover:underline flex items-center gap-1 bg-green-50 rounded px-2 py-1">
              <FileText className="w-3 h-3 shrink-0" />
              <span className="truncate">{doc.title || '議事録'}</span>
              <span className="text-[10px] text-green-500 shrink-0 ml-auto">自動</span>
            </a>
          ))}
        </div>
      )}
      {/* Manually saved notes URL */}
      {savedUrl && !editing && (
        <a href={savedUrl} target="_blank" rel="noopener noreferrer"
          className="text-xs text-blue-600 hover:text-blue-800 hover:underline break-all flex items-center gap-1">
          <ExternalLink className="w-3 h-3 shrink-0" /> 手動追加の議事録
        </a>
      )}
      {editing && (
        <div className="flex gap-1.5">
          <input
            type="url"
            value={notesUrl}
            onChange={e => setNotesUrl(e.target.value)}
            placeholder="議事録のURLを貼り付け"
            className="flex-1 text-xs border border-gray-300 rounded px-2 py-1 focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
          />
          <button onClick={handleSave} disabled={saving}
            className="text-xs bg-blue-600 text-white px-2 py-1 rounded hover:bg-blue-700 disabled:opacity-50">
            {saving ? '...' : '保存'}
          </button>
          <button onClick={() => { setEditing(false); setNotesUrl(savedUrl); }}
            className="text-xs text-gray-500 hover:text-gray-700 px-1">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
      {!hasContent && !editing && !loading && (
        <p className="text-[10px] text-gray-400">Meetで議事録が生成されると自動で表示されます</p>
      )}
    </div>
  );
}

// ─── Event Attachments Component ──────────────────────────

function EventAttachments({ eventId }: { eventId: string }) {
  const [attachments, setAttachments] = useState<Array<{ id: string; file_url: string; file_type: string; created_at: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [expandedImg, setExpandedImg] = useState<string | null>(null);
  const imgInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!eventId || eventId.startsWith('temp-')) { setLoading(false); return; }
    fetch(`/api/event-attachments?eventId=${eventId}`)
      .then(r => r.json())
      .then(d => setAttachments(d.attachments || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [eventId]);

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    Array.from(files).forEach(file => {
      const reader = new FileReader();
      reader.onload = async () => {
        const result = reader.result as string;
        const base64 = result.split(',')[1];
        try {
          const res = await fetch('/api/event-attachments', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ eventId, imageBase64: base64, fileType: file.type, context: 'manual' }),
          });
          const data = await res.json();
          if (data.attachment) setAttachments(prev => [data.attachment, ...prev]);
        } catch {}
      };
      reader.readAsDataURL(file);
    });
    e.target.value = '';
  };

  if (loading) return null;

  return (
    <div className="border-t border-gray-100 pt-2">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-medium text-gray-500 flex items-center gap-1">
          <Image className="w-3.5 h-3.5" /> 画像メモ ({attachments.length})
        </span>
        <button onClick={() => imgInputRef.current?.click()}
          className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-0.5">
          <Plus className="w-3 h-3" /> 追加
        </button>
        <input ref={imgInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleUpload} />
      </div>
      {attachments.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {attachments.map(a => (
            <button key={a.id} onClick={() => setExpandedImg(`data:${a.file_type};base64,${a.file_url}`)}
              className="shrink-0">
              <img src={`data:${a.file_type};base64,${a.file_url}`}
                className="w-16 h-16 object-cover rounded-lg border border-gray-200 hover:border-blue-300 transition-colors" />
            </button>
          ))}
        </div>
      )}
      {/* Expanded image modal */}
      {expandedImg && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[60]" onClick={() => setExpandedImg(null)}>
          <img src={expandedImg} className="max-w-[90vw] max-h-[85vh] object-contain rounded-lg" />
          <button onClick={() => setExpandedImg(null)}
            className="absolute top-4 right-4 p-2 bg-black/50 text-white rounded-full hover:bg-black/70">
            <X className="w-6 h-6" />
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Component ────────────────────────────────────────────

function CalendarPageContent() {
  const managedUserId = useManagedUser();
  const supabase = createClient();

  // Core state
  const [currentWeekStart, setCurrentWeekStart] = useState(() => {
    const now = new Date();
    const day = now.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    const monday = new Date(now);
    monday.setDate(now.getDate() + diff);
    monday.setHours(0, 0, 0, 0);
    return monday;
  });
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [availabilityWindows, setAvailabilityWindows] = useState<AvailabilityWindow[]>([]);
  const [bookingEventTypes, setBookingEventTypes] = useState<BookingEventType[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [memberEvents, setMemberEvents] = useState<Record<string, CalendarEvent[]>>({});
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | undefined>();

  // View controls
  const [isMobile, setIsMobile] = useState(false);
  const [viewDays, setViewDays] = useState<1 | 3 | 7 | 10 | 14>(7);
  const [freeScroll, setFreeScroll] = useState(true);
  const [initialLoad, setInitialLoad] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [showMonthPicker, setShowMonthPicker] = useState(false);
  const [monthPickerDate, setMonthPickerDate] = useState(new Date());
  const [currentTimePos, setCurrentTimePos] = useState<number | null>(null);


  // Mobile detection on mount
  useEffect(() => {
    const mobile = window.innerWidth < 768;
    setIsMobile(mobile);
    if (mobile) {
      setViewDays(3);
      // On mobile (3-day view), start from today instead of Monday
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      setCurrentWeekStart(today);
    }
  }, []);

  const [hourHeight, setHourHeight] = useState(isMobile ? 36 : 60);
  const startHour = 0; // Full 0-24h range
  const totalHours = END_HOUR - startHour;

  const [gridReady, setGridReady] = useState(false);

  // ─── Native touch gesture system ──────
  // Uses touch-action: none + manual scroll for FULL control over all gestures.
  // Gesture classification:
  //   - Quick move (<400ms): vertical → manual scroll, horizontal → day swipe
  //   - Hold 400ms + drag: drag-to-create new event
  //   - Pinch: handled by separate pinch-to-zoom listener
  type TouchGesture = 'undetermined' | 'vertical_scroll' | 'horizontal_swipe' | 'drag_create';
  const touchGestureRef = useRef<TouchGesture>('undetermined');
  const touchDataRef = useRef<{
    day: Date; clientY: number; clientX: number; colEl: HTMLElement;
    holdReady: boolean; prevClientY: number; prevClientX: number;
    lastClientX: number; lastClientY: number;
    timestamp: number; onEvent: boolean;
    velocities: { dy: number; dt: number }[]; // recent Y velocities with timestamps for momentum
    lastMoveTime: number;
  } | null>(null);
  const holdTimerRef = useRef<NodeJS.Timeout | null>(null);
  const momentumRef = useRef<number>(0); // rAF id for momentum scrolling
  const [holdIndicator, setHoldIndicator] = useState<{ x: number; y: number; dayStr: string } | null>(null);

  // Convert screen clientY to grid-relative Y
  // getBoundingClientRect() already accounts for scroll, so NO scrollTop needed
  const clientYToGridY = useCallback((clientY: number, colEl: HTMLElement) => {
    const rect = colEl.getBoundingClientRect();
    return clientY - rect.top;
  }, []);

  // Updater functions called from native listeners to update React state
  const startDragCreate = useCallback((day: Date, startGridY: number, currentGridY: number) => {
    hasMovedRef.current = true;
    setIsDragging(true);
    setDragStart({ day, y: startGridY });
    setDragEnd({ y: currentGridY });
    window.getSelection()?.removeAllRanges();
  }, []);

  const updateDragEnd = useCallback((gridY: number) => {
    const clamped = Math.max(0, Math.min(gridY, totalHours * hourHeight));
    setDragEnd({ y: clamped });
  }, [totalHours, hourHeight]);

  const finishSwipe = useCallback((dx: number, velocity?: number) => {
    // Velocity-based day count: faster swipe = more days
    const absV = Math.abs(velocity || 0);
    let days: number;
    if (absV > 2.0) days = Math.min(viewDays, 5); // Very fast → up to viewDays or 5
    else if (absV > 1.2) days = Math.min(3, viewDays);
    else if (absV > 0.6) days = 2;
    else days = 1;
    setCurrentWeekStart(prev => addDays(prev, dx < 0 ? days : -days));
  }, [viewDays]);

  // handleMouseUp is defined later; we call it from the native listener via a ref
  const handleMouseUpRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!isMobile) return;
    const grid = calendarGridRef.current;
    if (!grid) return;

    // Stop any ongoing momentum scroll
    const stopMomentum = () => {
      if (momentumRef.current) { cancelAnimationFrame(momentumRef.current); momentumRef.current = 0; }
    };

    // Start momentum scroll after touch end
    const startMomentum = (velocity: number) => {
      let v = velocity;
      const deceleration = 0.95;
      const minV = 0.5;
      const tick = () => {
        if (Math.abs(v) < minV) { momentumRef.current = 0; return; }
        grid.scrollTop -= v;
        v *= deceleration;
        momentumRef.current = requestAnimationFrame(tick);
      };
      momentumRef.current = requestAnimationFrame(tick);
    };

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length >= 2) return; // let pinch handler manage
      stopMomentum();

      const target = e.target as HTMLElement;
      const onEvent = !!target.closest('[data-event]');
      const dayCol = target.closest('[data-daycolumn]') as HTMLElement | null;
      if (!dayCol) return;
      const dayStr = dayCol.getAttribute('data-daycolumn');
      if (!dayStr) return;

      const touch = e.touches[0];
      touchGestureRef.current = 'undetermined';
      touchDataRef.current = {
        day: new Date(dayStr + 'T00:00:00'),
        clientY: touch.clientY,
        clientX: touch.clientX,
        colEl: dayCol,
        holdReady: false,
        prevClientY: touch.clientY,
        prevClientX: touch.clientX,
        lastClientX: touch.clientX,
        lastClientY: touch.clientY,
        timestamp: Date.now(),
        onEvent,
        velocities: [],
        lastMoveTime: Date.now(),
      };

      if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
      setHoldIndicator(null);
      if (!onEvent) {
        holdTimerRef.current = setTimeout(() => {
          if (touchDataRef.current && touchGestureRef.current === 'undetermined') {
            touchDataRef.current.holdReady = true;
            try { navigator.vibrate?.(30); } catch {}
            // Visual feedback: show indicator at hold position
            const td = touchDataRef.current;
            const rect = td.colEl.getBoundingClientRect();
            const dayAttr = td.colEl.getAttribute('data-daycolumn') || '';
            setHoldIndicator({ x: td.clientX - rect.left, y: td.clientY - rect.top, dayStr: dayAttr });
          }
        }, 400);
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      // イベントをドラッグ移動中またはリサイズ中はグリッドスクロールを無効化
      if (movingEventRef.current || resizingEventRef.current) {
        e.preventDefault();
        return;
      }
      if (!touchDataRef.current) return;
      if (e.touches.length >= 2) {
        // Hand off to pinch handler
        if (holdTimerRef.current) { clearTimeout(holdTimerRef.current); holdTimerRef.current = null; }
        touchGestureRef.current = 'undetermined';
        touchDataRef.current = null;
        return;
      }

      e.preventDefault(); // ALWAYS prevent default (touch-action: none backup)

      const touch = e.touches[0];
      const td = touchDataRef.current;
      const deltaY = touch.clientY - td.prevClientY;
      const deltaX = touch.clientX - td.prevClientX;
      td.prevClientY = touch.clientY;
      td.prevClientX = touch.clientX;
      td.lastClientX = touch.clientX;
      td.lastClientY = touch.clientY;

      const gesture = touchGestureRef.current;

      if (gesture === 'undetermined') {
        const dY = Math.abs(touch.clientY - td.clientY);
        const dX = Math.abs(touch.clientX - td.clientX);

        if (!td.holdReady) {
          // Before 400ms: classify direction on first significant move
          if (dX > 10 && dX > dY * 1.2) {
            touchGestureRef.current = 'horizontal_swipe';
            if (holdTimerRef.current) { clearTimeout(holdTimerRef.current); holdTimerRef.current = null; }
            return;
          }
          if (dY > 6) {
            touchGestureRef.current = 'vertical_scroll';
            if (holdTimerRef.current) { clearTimeout(holdTimerRef.current); holdTimerRef.current = null; }
            // Start scrolling immediately
            grid.scrollTop -= deltaY;
            const now = Date.now();
            const dt = now - td.lastMoveTime;
            td.lastMoveTime = now;
            if (dt > 0) { td.velocities.push({ dy: deltaY, dt }); if (td.velocities.length > 8) td.velocities.shift(); }
            return;
          }
          return;
        }

        // After 400ms hold: start drag-to-create
        if (dY > 8 || dX > 8) {
          touchGestureRef.current = 'drag_create';
          setHoldIndicator(null); // clear hold indicator
          const startGridY = clientYToGridY(td.clientY, td.colEl);
          const gridY = clientYToGridY(touch.clientY, td.colEl);
          startDragCreate(td.day, startGridY, gridY);
        }
        return;
      }

      if (gesture === 'vertical_scroll') {
        grid.scrollTop -= deltaY;
        const now = Date.now();
        const dt = now - td.lastMoveTime;
        td.lastMoveTime = now;
        if (dt > 0) { td.velocities.push({ dy: deltaY, dt }); if (td.velocities.length > 8) td.velocities.shift(); }
        return;
      }

      if (gesture === 'horizontal_swipe') {
        // Just track - action on touchEnd
        return;
      }

      if (gesture === 'drag_create') {
        const gridY = clientYToGridY(touch.clientY, td.colEl);
        updateDragEnd(gridY);
      }
    };

    const onTouchEnd = () => {
      if (holdTimerRef.current) { clearTimeout(holdTimerRef.current); holdTimerRef.current = null; }
      setHoldIndicator(null);
      if (!touchDataRef.current) {
        touchGestureRef.current = 'undetermined';
        return;
      }
      const td = touchDataRef.current;
      const gesture = touchGestureRef.current;

      if (gesture === 'vertical_scroll') {
        // Calculate momentum velocity from recent samples (last 100ms only)
        // Use only recent samples to avoid stale data, and weight by time
        const now = Date.now();
        const recentSamples = td.velocities.filter(v => v.dt < 50); // only frames < 50ms apart
        if (recentSamples.length >= 2) {
          // Use last 3 recent samples for stable direction
          const last = recentSamples.slice(-3);
          const totalDy = last.reduce((sum, v) => sum + v.dy, 0);
          const totalDt = last.reduce((sum, v) => sum + v.dt, 0);
          const velocity = totalDt > 0 ? (totalDy / totalDt) * 16 : 0; // px per frame (~16ms)
          if (Math.abs(velocity) > 1) startMomentum(velocity);
        }
      }

      if (gesture === 'horizontal_swipe') {
        const totalDx = td.lastClientX - td.clientX;
        const dt = Date.now() - td.timestamp;
        const velocityX = dt > 0 ? totalDx / dt : 0; // px/ms
        if (Math.abs(totalDx) > 40 && dt < 1200) {
          finishSwipe(totalDx, velocityX);
        }
      }

      if (gesture === 'drag_create') {
        handleMouseUpRef.current?.();
      }

      touchGestureRef.current = 'undetermined';
      touchDataRef.current = null;
    };

    // ALL non-passive for full control
    grid.addEventListener('touchstart', onTouchStart, { passive: false });
    grid.addEventListener('touchmove', onTouchMove, { passive: false });
    grid.addEventListener('touchend', onTouchEnd, { passive: true });
    return () => {
      grid.removeEventListener('touchstart', onTouchStart);
      grid.removeEventListener('touchmove', onTouchMove);
      grid.removeEventListener('touchend', onTouchEnd);
      if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
      stopMomentum();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMobile, gridReady, clientYToGridY, startDragCreate, updateDragEnd, finishSwipe]);

  // Pinch-to-zoom for time axis - zooms around the pinch center point
  const pinchRef = useRef<{
    initialDistance: number;
    initialHourHeight: number;
    centerClientY: number;   // screen Y of pinch center at start
    centerTimeOffset: number; // hours from startHour at pinch center
  } | null>(null);
  useEffect(() => {
    const grid = calendarGridRef.current;
    if (!grid) return;
    const onTouchStartZoom = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        const d = Math.hypot(e.touches[1].clientX - e.touches[0].clientX, e.touches[1].clientY - e.touches[0].clientY);
        // Calculate pinch center in time coordinates
        const centerClientY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
        const gridRect = grid.getBoundingClientRect();
        const gridY = centerClientY - gridRect.top + grid.scrollTop;
        const centerTimeOffset = gridY / hourHeight; // hours from top
        pinchRef.current = {
          initialDistance: d,
          initialHourHeight: hourHeight,
          centerClientY,
          centerTimeOffset,
        };
      }
    };
    const onTouchMoveZoom = (e: TouchEvent) => {
      if (e.touches.length === 2 && pinchRef.current) {
        e.preventDefault();
        const d = Math.hypot(e.touches[1].clientX - e.touches[0].clientX, e.touches[1].clientY - e.touches[0].clientY);
        const scale = d / pinchRef.current.initialDistance;
        const newHeight = Math.round(Math.max(20, Math.min(100, pinchRef.current.initialHourHeight * scale)));

        // Adjust scroll so the pinch center stays at the same screen position
        const gridRect = grid.getBoundingClientRect();
        const centerScreenOffset = pinchRef.current.centerClientY - gridRect.top;
        // The pinch center time should stay at the same screen position
        const newScrollTop = pinchRef.current.centerTimeOffset * newHeight - centerScreenOffset;
        setHourHeight(newHeight);
        requestAnimationFrame(() => {
          grid.scrollTop = Math.max(0, newScrollTop);
        });
      }
    };
    const onTouchEndZoom = () => { pinchRef.current = null; };
    grid.addEventListener('touchstart', onTouchStartZoom, { passive: true });
    grid.addEventListener('touchmove', onTouchMoveZoom, { passive: false });
    grid.addEventListener('touchend', onTouchEndZoom, { passive: true });
    return () => {
      grid.removeEventListener('touchstart', onTouchStartZoom);
      grid.removeEventListener('touchmove', onTouchMoveZoom);
      grid.removeEventListener('touchend', onTouchEndZoom);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hourHeight, gridReady]);

  // Current time indicator - update every 30s
  useEffect(() => {
    const update = () => {
      const now = new Date();
      const hours = now.getHours() + now.getMinutes() / 60;
      setCurrentTimePos((hours - startHour) * hourHeight);
    };
    update();
    const interval = setInterval(update, 30000);
    return () => clearInterval(interval);
  }, [hourHeight, startHour]);

  // Sidebar
  const [calendarSources, setCalendarSources] = useState<CalendarSource[]>([]);
  const [filterText, setFilterText] = useState('');
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [colorPickerSourceId, setColorPickerSourceId] = useState<string | null>(null);

  // Event detail/edit modal
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [editForm, setEditForm] = useState({
    summary: '', description: '',
    startDate: '', startTimeStr: '', endDate: '', endTimeStr: '',
    location: '', locationType: 'online' as 'online' | 'offline',
  });
  const [savingEvent, setSavingEvent] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletingEvent, setDeletingEvent] = useState(false);

  // Booking modal
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);

  // Override modal
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const [showOverrideModal, setShowOverrideModal] = useState(false);
  const [overrideType, setOverrideType] = useState<'available' | 'blocked'>('available');
  const [overrideStart, setOverrideStart] = useState('09:00');
  const [overrideEnd, setOverrideEnd] = useState('17:00');

  // ─── Schedule Match (予定調整) ───
  const [showScheduleMatch, setShowScheduleMatch] = useState(false);
  const [scheduleMatchStep, setScheduleMatchStep] = useState<'input' | 'loading' | 'result'>('input');
  const [scheduleMatchInput, setScheduleMatchInput] = useState('');
  const [scheduleMatchImage, setScheduleMatchImage] = useState<string | null>(null);
  const [scheduleMatchImageType, setScheduleMatchImageType] = useState<string>('image/png');
  const [scheduleMatchTimeFilter, setScheduleMatchTimeFilter] = useState<'all' | 'morning' | 'afternoon' | 'evening'>('all');
  const [scheduleMatchResult, setScheduleMatchResult] = useState<{
    analysis: string;
    slots: Array<{ date: string; start: string; end: string; label: string }>;
    suggestedReply: string;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const handleScheduleMatchSubmit = async (inputText?: string, imageData?: string, imageType?: string) => {
    setScheduleMatchStep('loading');
    try {
      const res = await fetch('/api/schedule-match', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: inputText || scheduleMatchInput || undefined,
          image: imageData || scheduleMatchImage || undefined,
          mediaType: imageType || scheduleMatchImageType,
          timeFilter: scheduleMatchTimeFilter,
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setScheduleMatchResult(data);
      setScheduleMatchStep('result');
    } catch (err) {
      alert('エラーが発生しました: ' + (err instanceof Error ? err.message : '不明なエラー'));
      setScheduleMatchStep('input');
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(',')[1];
      setScheduleMatchImage(base64);
      setScheduleMatchImageType(file.type || 'image/png');
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const resetScheduleMatch = () => {
    setScheduleMatchStep('input');
    setScheduleMatchInput('');
    setScheduleMatchImage(null);
    setScheduleMatchTimeFilter('all');
    setScheduleMatchResult(null);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  // Hover tooltip (1 second delay)
  const [hoverEvent, setHoverEvent] = useState<{ event: CalendarEvent | Booking; type: 'google' | 'member' | 'booking'; memberId?: string; rect: DOMRect } | null>(null);
  const hoverTimerRef = useRef<NodeJS.Timeout | null>(null);

  const handleEventMouseEnter = (e: React.MouseEvent, event: CalendarEvent | Booking, type: 'google' | 'member' | 'booking', memberId?: string) => {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    hoverTimerRef.current = setTimeout(() => {
      setHoverEvent({ event, type, memberId, rect });
    }, 1000);
  };

  const handleEventMouseLeave = () => {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    hoverTimerRef.current = null;
    setHoverEvent(null);
  };

  // Drag-to-create
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<{ day: Date; y: number } | null>(null);
  const [dragEnd, setDragEnd] = useState<{ y: number } | null>(null);
  const [showNewEventForm, setShowNewEventForm] = useState(false);
  const [newEventForm, setNewEventForm] = useState({
    summary: '', description: '',
    startDate: '', startTimeStr: '', endDate: '', endTimeStr: '',
    locationType: 'online' as 'online' | 'offline', location: '',
    reminderMinutes: 10,
  });
  const [creatingEvent, setCreatingEvent] = useState(false);
  const [newEventImages, setNewEventImages] = useState<Array<{ base64: string; type: string }>>([]);
  const newEventImageRef = useRef<HTMLInputElement>(null);

  // Drag-to-move existing event
  const [movingEvent, setMovingEvent] = useState<CalendarEvent | null>(null);
  const [moveOffset, setMoveOffset] = useState(0); // y offset from event top to mouse
  const [moveCurrentY, setMoveCurrentY] = useState(0);
  const [moveCurrentDay, setMoveCurrentDay] = useState<Date | null>(null);
  // movingEventSaving removed — using optimistic update

  // Resize existing event (drag top/bottom edge)
  const [resizingEvent, setResizingEvent] = useState<CalendarEvent | null>(null);
  const [resizeEdge, setResizeEdge] = useState<'top' | 'bottom'>('bottom');
  const [resizeCurrentY, setResizeCurrentY] = useState(0);
  // resizingSaving removed — using optimistic update

  // Refs
  const calendarGridRef = useRef<HTMLDivElement | null>(null);
  // touch gesture handled by native listeners in useEffect above
  const cacheRef = useRef<CacheEntry | null>(null);

  // Restore cache from sessionStorage on mount for instant display
  const [restoredFromCache, setRestoredFromCache] = useState(false);
  useEffect(() => {
    const stored = loadCacheFromStorage();
    if (stored) {
      cacheRef.current = stored;
      setEvents(stored.events);
      setAvailabilityWindows(stored.availabilityWindows);
      setBookingEventTypes(stored.bookingEventTypes);
      setBookings(stored.bookings);
      setMemberEvents(stored.memberEvents || {});
      setLoading(false);
      setRestoredFromCache(true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const prefetchingRef = useRef(false);
  const scrollDeltaRef = useRef(0);
  const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isDraggingRef = useRef(false);
  const hasMovedRef = useRef(false);
  const movingEventRef = useRef<CalendarEvent | null>(null);
  const resizingEventRef = useRef<CalendarEvent | null>(null);
  const resizeEdgeRef = useRef<'top' | 'bottom'>('bottom');
  const resizeCurrentYRef = useRef(0);
  const moveCurrentYRef = useRef(0);
  const moveCurrentDayRef = useRef<Date | null>(null);
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Dynamic
  const weekDays = Array.from({ length: viewDays }, (_, i) => addDays(currentWeekStart, i));
  const hours = Array.from({ length: totalHours }, (_, i) => i + startHour);

  // ─── Effects ──────────────────────────────────────────

  const [currentUserName, setCurrentUserName] = useState<string>('Googleカレンダー');

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        setCurrentUserId(user.id);
        // Fetch all users
        fetch('/api/users').then(r => r.json()).then(data => {
          const allUsers = data.users || [];
          const me = allUsers.find((u: TeamMember) => u.id === user.id);
          if (me) setCurrentUserName(me.name || me.email);
          const others = allUsers.filter((u: TeamMember) => u.id !== user.id);
          setTeamMembers(others);
        });
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { isDraggingRef.current = isDragging; }, [isDragging]);

  // Scroll to DEFAULT_SCROLL_HOUR (7:00) on initial load
  const hasScrolledRef = useRef(false);
  const prevLayoutRef = useRef<Map<string, { col: number; groupKey: string }>>(new Map());
  useEffect(() => {
    if (!initialLoad && !hasScrolledRef.current && calendarGridRef.current) {
      hasScrolledRef.current = true;
      const scrollTo = DEFAULT_SCROLL_HOUR * hourHeight;
      calendarGridRef.current.scrollTop = scrollTo;
    }
  }, [initialLoad, hourHeight]);

  // Build calendar sources
  useEffect(() => {
    const sources: CalendarSource[] = [
      { id: 'google', name: currentUserName, color: '#3b82f6', type: 'google', visible: true },
    ];
    // Add team member calendars
    teamMembers.forEach((member, i) => {
      sources.push({
        id: `member-${member.id}`,
        name: member.name || member.email,
        color: MEMBER_COLORS[i % MEMBER_COLORS.length],
        type: 'member',
        visible: true,
      });
    });
    bookingEventTypes.forEach(et => {
      const displayName = et.owner_name
        ? `${et.owner_name}：${et.name}`
        : et.name;
      sources.push({ id: `booking-${et.id}`, name: displayName, color: et.color, type: 'booking', visible: true });
    });
    setCalendarSources(prev => {
      const prevMap = new Map(prev.map(s => [s.id, s.visible]));
      return sources.map(s => ({ ...s, visible: prevMap.has(s.id) ? prevMap.get(s.id)! : true }));
    });
  }, [bookingEventTypes, teamMembers, currentUserName]);

  // ─── Fetch Logic (with caching) ───────────────────────

  const fetchRange = useCallback(async (startDate: string, endDate: string) => {
    try {
      const targetParam = managedUserId ? `&targetUserId=${managedUserId}` : '';
      const attendeeParam = teamMembers.length > 0 ? `&attendeeIds=${teamMembers.map(m => m.id).join(',')}` : '';
      const [calRes, bookRes] = await Promise.all([
        fetch(`/api/calendar/events?startDate=${startDate}&endDate=${endDate}${targetParam}${attendeeParam}`),
        fetch(`/api/calendar/bookings?weekStart=${startDate}&weekEnd=${endDate}${targetParam}`),
      ]);

      let evts: CalendarEvent[] = [];
      let avail: AvailabilityWindow[] = [];
      let types: BookingEventType[] = [];
      let books: Booking[] = [];
      let memEvts: Record<string, CalendarEvent[]> = {};

      if (calRes.ok) {
        const d = await calRes.json();
        evts = d.events || [];
        avail = d.availabilityWindows || [];
        memEvts = d.attendeeEvents || {};
      }
      if (bookRes.ok) {
        const d = await bookRes.json();
        types = d.eventTypes || [];
        books = d.bookings || [];
      }
      return { events: evts, availabilityWindows: avail, bookingEventTypes: types, bookings: books, memberEvents: memEvts } as Omit<CacheEntry, 'rangeStart' | 'rangeEnd' | 'fetchedAt'>;
    } catch (err) {
      console.error('Failed to fetch range:', err);
      return null;
    }
  }, [managedUserId, teamMembers]);

  const fetchEvents = useCallback(async () => {
    const visibleStart = format(currentWeekStart, 'yyyy-MM-dd');
    const visibleEnd = format(addDays(currentWeekStart, viewDays), 'yyyy-MM-dd');

    // Cache hit (must match same user and same member count)
    const cacheUserId = managedUserId || '__self__';
    const currentMemberCount = teamMembers.length;
    if (cacheRef.current &&
        cacheRef.current.userId === cacheUserId &&
        cacheRef.current.memberCount === currentMemberCount &&
        cacheRef.current.rangeStart <= visibleStart &&
        cacheRef.current.rangeEnd >= visibleEnd &&
        Date.now() - cacheRef.current.fetchedAt < 120000) {
      setEvents(cacheRef.current.events);
      setAvailabilityWindows(cacheRef.current.availabilityWindows);
      setBookingEventTypes(cacheRef.current.bookingEventTypes);
      setBookings(cacheRef.current.bookings);
      setMemberEvents(cacheRef.current.memberEvents || {});
      setLoading(false);
      return;
    }

    // Show loading only on true first load (not when restored from sessionStorage)
    if (initialLoad && !restoredFromCache) setLoading(true);
    const data = await fetchRange(visibleStart, visibleEnd);
    if (data) {
      setEvents(data.events);
      setAvailabilityWindows(data.availabilityWindows);
      setBookingEventTypes(data.bookingEventTypes);
      setBookings(data.bookings);
      setMemberEvents(data.memberEvents || {});
      const newCache: CacheEntry = {
        ...data,
        userId: cacheUserId,
        memberCount: currentMemberCount,
        rangeStart: visibleStart,
        rangeEnd: visibleEnd,
        fetchedAt: Date.now(),
      };
      cacheRef.current = newCache;
      saveCacheToStorage(newCache);
    }
    setLoading(false);
    setInitialLoad(false);

    // Background prefetch ±10 days
    if (!prefetchingRef.current) {
      prefetchingRef.current = true;
      const pfStart = format(addDays(currentWeekStart, -10), 'yyyy-MM-dd');
      const pfEnd = format(addDays(currentWeekStart, viewDays + 10), 'yyyy-MM-dd');
      setTimeout(async () => {
        try {
          const pfData = await fetchRange(pfStart, pfEnd);
          if (pfData) {
            const pfCache: CacheEntry = {
              ...pfData,
              userId: cacheUserId,
              memberCount: currentMemberCount,
              rangeStart: pfStart,
              rangeEnd: pfEnd,
              fetchedAt: Date.now(),
            };
            cacheRef.current = pfCache;
            saveCacheToStorage(pfCache);
          }
        } catch { /* ignore */ }
        prefetchingRef.current = false;
      }, 100);
    }
  }, [currentWeekStart, viewDays, fetchRange, initialLoad, managedUserId, teamMembers, restoredFromCache]);

  // Keep fetchEvents ref always up-to-date to avoid stale closures in move/resize handlers
  const fetchEventsRef = useRef(fetchEvents);
  useEffect(() => { fetchEventsRef.current = fetchEvents; }, [fetchEvents]);

  useEffect(() => { fetchEvents(); }, [fetchEvents]);

  // ─── Wheel Scroll ─────────────────────────────────────

  useEffect(() => {
    const container = calendarGridRef.current;
    if (!container || !freeScroll) return;

    const handleWheel = (e: WheelEvent) => {
      if (isDraggingRef.current) return;

      // Detect horizontal scroll intent:
      // 1. Trackpad horizontal swipe (deltaX dominant)
      // 2. Shift + mouse wheel (shiftKey converts deltaY to horizontal)
      let deltaX = 0;
      if (e.shiftKey && Math.abs(e.deltaY) > 0) {
        // Shift + vertical scroll → treat as horizontal
        deltaX = e.deltaY;
      } else if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
        // Trackpad horizontal swipe
        deltaX = e.deltaX;
      }

      if (deltaX === 0) return;
      e.preventDefault();
      scrollDeltaRef.current += deltaX;
      if (Math.abs(scrollDeltaRef.current) >= 80) {
        const dayShift = scrollDeltaRef.current > 0 ? 1 : -1;
        setCurrentWeekStart(prev => addDays(prev, dayShift));
        scrollDeltaRef.current = 0;
      }
      if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
      scrollTimeoutRef.current = setTimeout(() => { scrollDeltaRef.current = 0; }, 150);
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      container.removeEventListener('wheel', handleWheel);
      if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
    };
  }, [freeScroll, gridReady]);

  // ─── Helpers ──────────────────────────────────────────

  const PICKER_COLORS = ['#3b82f6', '#8b5cf6', '#ec4899', '#ef4444', '#f97316', '#eab308', '#22c55e', '#14b8a6', '#6366f1', '#64748b'];

  const changeSourceColor = (id: string, color: string) => {
    setCalendarSources(prev => prev.map(s => s.id === id ? { ...s, color } : s));
    setColorPickerSourceId(null);
  };

  // Close color picker when clicking outside
  useEffect(() => {
    if (!colorPickerSourceId) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.grid.grid-cols-5') && !target.classList.contains('cursor-pointer')) {
        setColorPickerSourceId(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [colorPickerSourceId]);

  const toggleSource = (id: string) => {
    setCalendarSources(prev => prev.map(s => s.id === id ? { ...s, visible: !s.visible } : s));
  };
  const selectAll = () => setCalendarSources(prev => prev.map(s => ({ ...s, visible: true })));
  const deselectAll = () => setCalendarSources(prev => prev.map(s => ({ ...s, visible: false })));

  const isGoogleVisible = calendarSources.find(s => s.id === 'google')?.visible ?? true;
  const isBookingVisible = (eventTypeId: string) => calendarSources.find(s => s.id === `booking-${eventTypeId}`)?.visible ?? true;
  const isMemberVisible = (memberId: string) => calendarSources.find(s => s.id === `member-${memberId}`)?.visible ?? true;
  const getMemberColor = (memberId: string) => calendarSources.find(s => s.id === `member-${memberId}`)?.color || '#8b5cf6';
  const getGoogleColor = () => calendarSources.find(s => s.id === 'google')?.color || '#3b82f6';
  const getBookingColor = (eventTypeId: string) => calendarSources.find(s => s.id === `booking-${eventTypeId}`)?.color || bookingEventTypes.find(et => et.id === eventTypeId)?.color || '#8b5cf6';
  const getBookingTypeName = (eventTypeId: string) => bookingEventTypes.find(et => et.id === eventTypeId)?.name || '';

  const filteredSources = calendarSources.filter(s =>
    !filterText || s.name.toLowerCase().includes(filterText.toLowerCase())
  );
  const allVisible = calendarSources.every(s => s.visible);
  const noneVisible = calendarSources.every(s => !s.visible);

  const getEventPosition = (startStr: string, endStr: string) => {
    const start = parseISO(startStr);
    const end = parseISO(endStr);
    const eventStartHour = start.getHours() + start.getMinutes() / 60;
    const eventEndHour = end.getHours() + end.getMinutes() / 60;
    const top = (eventStartHour - startHour) * hourHeight;
    const height = (eventEndHour - eventStartHour) * hourHeight;
    return { top: Math.max(0, top), height: Math.max(15, height) };
  };

  const getDayEvents = (day: Date) => events.filter(e => !e.allDay && isSameDay(parseISO(e.start), day));
  const getDayAllDayEvents = (day: Date) => events.filter(e => e.allDay && isSameDay(parseISO(e.start), day));
  const getDayBookings = (day: Date) => bookings.filter(b => isSameDay(parseISO(b.start_time), day) && isBookingVisible(b.event_type_id));
  const getDayMemberEvents = (day: Date) => {
    const result: Array<CalendarEvent & { memberId: string }> = [];
    for (const [memberId, evts] of Object.entries(memberEvents)) {
      if (!isMemberVisible(memberId)) continue;
      for (const e of evts) {
        if (!e.allDay && isSameDay(parseISO(e.start), day)) {
          result.push({ ...e, memberId });
        }
      }
    }
    return result;
  };

  // ─── Column layout for overlapping events ────────────
  interface LayoutEvent {
    id: string;
    start: string;
    end: string;
    source: 'google' | 'member' | 'booking';
    memberId?: string;
    event?: CalendarEvent;
    booking?: Booking;
    col: number;
    totalCols: number;
  }

  const getDayLayout = (day: Date): LayoutEvent[] => {
    const items: LayoutEvent[] = [];

    // Collect Google events
    if (isGoogleVisible) {
      getDayEvents(day).forEach(e => {
        items.push({ id: e.id, start: e.start, end: e.end, source: 'google', event: e, col: 0, totalCols: 1 });
      });
    }

    // Collect member events
    getDayMemberEvents(day).forEach(e => {
      items.push({ id: `m-${e.memberId}-${e.id}`, start: e.start, end: e.end, source: 'member', memberId: e.memberId, event: e, col: 0, totalCols: 1 });
    });

    // Collect booking events
    getDayBookings(day).forEach(b => {
      items.push({ id: b.id, start: b.start_time, end: b.end_time, source: 'booking', booking: b, col: 0, totalCols: 1 });
    });

    if (items.length === 0) return items;

    // Sort by start time
    items.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());

    // Build overlap groups: connected components of overlapping events
    // Two events overlap if their time ranges intersect
    const n = items.length;
    const parent = Array.from({ length: n }, (_, i) => i);
    const find = (x: number): number => parent[x] === x ? x : (parent[x] = find(parent[x]));
    const union = (a: number, b: number) => { parent[find(a)] = find(b); };

    for (let i = 0; i < n; i++) {
      const iStart = new Date(items[i].start).getTime();
      const iEnd = new Date(items[i].end).getTime();
      for (let j = i + 1; j < n; j++) {
        const jStart = new Date(items[j].start).getTime();
        const jEnd = new Date(items[j].end).getTime();
        if (jStart < iEnd && jEnd > iStart) {
          union(i, j);
        }
      }
    }

    // Group items by their connected component
    const groups = new Map<number, number[]>();
    for (let i = 0; i < n; i++) {
      const root = find(i);
      if (!groups.has(root)) groups.set(root, []);
      groups.get(root)!.push(i);
    }

    // For each group, assign columns independently
    // Preserve previous column positions when the group membership hasn't changed
    for (const [, indices] of groups) {
      // Sort group by start time
      indices.sort((a, b) => new Date(items[a].start).getTime() - new Date(items[b].start).getTime());

      // Generate a group key from sorted member IDs
      const groupKey = indices.map(i => items[i].id).sort().join(',');

      // Check if previous layout had the exact same group composition
      const prevCols = indices.map(i => prevLayoutRef.current.get(items[i].id));
      const sameGroup = prevCols.every(p => p && p.groupKey === groupKey);

      if (sameGroup) {
        // Reuse previous column assignments
        for (const idx of indices) {
          items[idx].col = prevLayoutRef.current.get(items[idx].id)!.col;
        }
      } else {
        // Fresh greedy column assignment
        const colEnds: number[] = []; // end times of each column in this group
        for (const idx of indices) {
          const itemStart = new Date(items[idx].start).getTime();
          let placed = false;
          for (let c = 0; c < colEnds.length; c++) {
            if (colEnds[c] <= itemStart) {
              items[idx].col = c;
              colEnds[c] = new Date(items[idx].end).getTime();
              placed = true;
              break;
            }
          }
          if (!placed) {
            items[idx].col = colEnds.length;
            colEnds.push(new Date(items[idx].end).getTime());
          }
        }
      }

      // All items in this group share the same totalCols
      const maxCol = Math.max(...indices.map(i => items[i].col));
      const groupTotalCols = maxCol + 1;
      for (const idx of indices) {
        items[idx].totalCols = groupTotalCols;
      }
    }

    // Update layout cache for next render
    const newCache = new Map<string, { col: number; groupKey: string }>();
    for (const item of items) {
      // Find this item's group key
      const groupIndices = Array.from(groups.values()).find(idxs => idxs.some(i => items[i].id === item.id));
      const groupKey = groupIndices ? groupIndices.map(i => items[i].id).sort().join(',') : item.id;
      newCache.set(item.id, { col: item.col, groupKey });
    }
    prevLayoutRef.current = newCache;

    return items;
  };

  // Helper: check if a day is weekend or holiday
  const isDayOff = (day: Date): boolean => {
    const dow = day.getDay();
    const dateStr = format(day, 'yyyy-MM-dd');
    return dow === 0 || dow === 6 || isJapaneseHoliday(dateStr);
  };
  const isSaturday = (day: Date): boolean => day.getDay() === 6;
  const isSunday = (day: Date): boolean => day.getDay() === 0;
  const isHoliday = (day: Date): boolean => isJapaneseHoliday(format(day, 'yyyy-MM-dd'));

  const yToTime = (y: number): string => {
    const totalMinutes = Math.round((y / hourHeight) * 60 / 15) * 15;
    const hour = startHour + Math.floor(totalMinutes / 60);
    const min = totalMinutes % 60;
    return `${String(Math.min(hour, END_HOUR)).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
  };

  // ─── Event CRUD Handlers ──────────────────────────────

  const toggleOverlap = async (event: CalendarEvent) => {
    try {
      const res = await fetch('/api/calendar/event-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          googleEventId: event.id,
          eventSummary: event.summary,
          eventStart: event.start,
          eventEnd: event.end,
          allowOverlap: !event.allowOverlap,
        }),
      });
      if (res.ok) {
        setEvents(prev => prev.map(e => e.id === event.id ? { ...e, allowOverlap: !e.allowOverlap } : e));
        setSelectedEvent(prev => prev && prev.id === event.id ? { ...prev, allowOverlap: !prev.allowOverlap } : prev);
      }
    } catch (err) { console.error('Failed to toggle overlap:', err); }
  };

  const toggleTransparency = async (event: CalendarEvent) => {
    const newTransparency = event.transparency === 'transparent' ? 'opaque' : 'transparent';
    // Optimistic update
    setEvents(prev => prev.map(e => e.id === event.id ? { ...e, transparency: newTransparency } : e));
    setSelectedEvent(prev => prev && prev.id === event.id ? { ...prev, transparency: newTransparency } : prev);
    try {
      const res = await fetch('/api/calendar/events', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventId: event.id,
          transparency: newTransparency,
        }),
      });
      if (!res.ok) {
        // Rollback on failure
        setEvents(prev => prev.map(e => e.id === event.id ? { ...e, transparency: event.transparency } : e));
        setSelectedEvent(prev => prev && prev.id === event.id ? { ...prev, transparency: event.transparency } : prev);
        console.error('Failed to update transparency');
      } else {
        // If recurring event, propagate to all instances with same recurringEventId
        if (event.recurringEventId) {
          setEvents(prev => prev.map(e =>
            e.recurringEventId === event.recurringEventId ? { ...e, transparency: newTransparency } : e
          ));
        }
      }
    } catch (err) {
      // Rollback
      setEvents(prev => prev.map(e => e.id === event.id ? { ...e, transparency: event.transparency } : e));
      setSelectedEvent(prev => prev && prev.id === event.id ? { ...prev, transparency: event.transparency } : prev);
      console.error('Failed to toggle transparency:', err);
    }
  };

  const handleEditStart = (event: CalendarEvent) => {
    setEditForm({
      summary: event.summary,
      description: event.description || '',
      startDate: event.start.slice(0, 10),
      startTimeStr: event.start.slice(11, 16),
      endDate: event.end.slice(0, 10),
      endTimeStr: event.end.slice(11, 16),
      location: event.location || '',
      locationType: event.meetLink ? 'online' : (event.location ? 'offline' : 'online'),
    });
    setEditMode(true);
  };

  const handleSaveEdit = async () => {
    if (!selectedEvent) return;
    setSavingEvent(true);
    try {
      const res = await fetch('/api/calendar/events', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventId: selectedEvent.id,
          summary: editForm.summary,
          description: editForm.description,
          startTime: `${editForm.startDate}T${editForm.startTimeStr}:00`,
          endTime: `${editForm.endDate}T${editForm.endTimeStr}:00`,
          location: editForm.locationType === 'offline' ? editForm.location : '',
          locationType: editForm.locationType,
        }),
      });
      if (res.ok) {
        cacheRef.current = null; clearCacheStorage();
        await fetchEvents();
        setSelectedEvent(null);
        setEditMode(false);
      }
    } catch (err) { console.error('Failed to save:', err); }
    finally { setSavingEvent(false); }
  };

  const handleDeleteEvent = async () => {
    if (!selectedEvent) return;
    setDeletingEvent(true);
    try {
      const res = await fetch('/api/calendar/events', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId: selectedEvent.id }),
      });
      if (res.ok) {
        cacheRef.current = null; clearCacheStorage();
        await fetchEvents();
        setSelectedEvent(null);
        setShowDeleteConfirm(false);
      }
    } catch (err) { console.error('Failed to delete:', err); }
    finally { setDeletingEvent(false); }
  };

  const handleCreateEvent = async () => {
    if (!newEventForm.summary) return;
    const startTime = `${newEventForm.startDate}T${newEventForm.startTimeStr}:00`;
    const endTime = `${newEventForm.endDate}T${newEventForm.endTimeStr}:00`;

    // Optimistic: add temporary event immediately and close modal
    const tempId = `temp-${Date.now()}`;
    const tempEvent: CalendarEvent = {
      id: tempId,
      summary: newEventForm.summary,
      description: newEventForm.description,
      start: startTime,
      end: endTime,
      allDay: false,
      allowOverlap: false,
      location: newEventForm.locationType === 'offline' ? newEventForm.location : '',
      meetLink: newEventForm.locationType === 'online' ? 'pending...' : '',
    };
    const imagesToSave = [...newEventImages];
    setEvents(prev => [...prev, tempEvent]);
    setShowNewEventForm(false);
    setNewEventImages([]);

    // Background sync with Google Calendar
    try {
      const res = await fetch('/api/calendar/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          summary: newEventForm.summary,
          description: newEventForm.description,
          startTime,
          endTime,
          locationType: newEventForm.locationType,
          location: newEventForm.location,
          reminderMinutes: newEventForm.reminderMinutes,
        }),
      });
      // Replace temp event with real one
      cacheRef.current = null; clearCacheStorage();
      if (res.ok) {
        const data = await res.json();
        const realEventId = data.event.eventId;
        setEvents(prev => prev.map(e => e.id === tempId ? { ...tempEvent, id: realEventId, meetLink: data.event.meetLink || '' } : e));
        // Save attached images
        for (const img of imagesToSave) {
          fetch('/api/event-attachments', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              eventId: realEventId,
              imageBase64: img.base64,
              fileType: img.type,
              context: 'manual',
            }),
          }).catch(err => console.error('Failed to save image:', err));
        }
        // Full refresh after a short delay to get complete data
        setTimeout(() => { cacheRef.current = null; clearCacheStorage(); fetchEventsRef.current(); }, 2000);
      } else {
        // Remove temp event on failure
        setEvents(prev => prev.filter(e => e.id !== tempId));
        alert('Googleカレンダーへの保存に失敗しました');
      }
    } catch (err) {
      console.error('Failed to create:', err);
      setEvents(prev => prev.filter(e => e.id !== tempId));
      alert('ネットワークエラー: 予定の作成に失敗しました');
    }
  };

  // ─── Drag-to-Move Existing Event ──────────────────────

  const handleEventDragStart = (event: CalendarEvent, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (event.allDay) return; // Don't drag all-day events

    // Find which day column this event is in
    const eventDay = weekDays.find(d => isSameDay(d, parseISO(event.start)));
    if (!eventDay) return;

    const pos = getEventPosition(event.start, event.end);
    const gridEl = calendarGridRef.current;
    if (!gridEl) return;

    // Calculate the offset: where did they click within the event block?
    const dayColEls = gridEl.querySelectorAll('[data-daycolumn]');
    let dayRect: DOMRect | null = null;
    dayColEls.forEach(el => {
      if (el.getAttribute('data-daycolumn') === format(eventDay, 'yyyy-MM-dd')) {
        dayRect = el.getBoundingClientRect();
      }
    });
    if (!dayRect) return;

    // getBoundingClientRect() already accounts for scroll
    const mouseY = e.clientY - (dayRect as DOMRect).top;
    const offsetFromTop = mouseY - pos.top;

    setMovingEvent(event);
    movingEventRef.current = event;
    setMoveOffset(offsetFromTop);
    setMoveCurrentY(pos.top);
    moveCurrentYRef.current = pos.top;
    setMoveCurrentDay(eventDay);
    moveCurrentDayRef.current = eventDay;
    hasMovedRef.current = false;
  };

  const handleEventTouchStart = (event: CalendarEvent, e: React.TouchEvent) => {
    const touch = e.touches[0];
    const startX = touch.clientX;
    const startY = touch.clientY;

    longPressTimerRef.current = setTimeout(() => {
      // Simulate mouse event for handleEventDragStart
      handleEventDragStart(event, {
        stopPropagation: () => {},
        preventDefault: () => {},
        clientY: startY,
        clientX: startX,
      } as unknown as React.MouseEvent);
    }, 300);
  };

  const handleEventTouchEnd = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const handleEventTouchMove = () => {
    // Cancel long press if finger moves (user is scrolling)
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const handleMoveMouseMove = useCallback((e: MouseEvent) => {
    if (!movingEventRef.current) return;
    hasMovedRef.current = true;

    const gridEl = calendarGridRef.current;
    if (!gridEl) return;

    // Determine which day column the mouse is over
    const dayColEls = gridEl.querySelectorAll('[data-daycolumn]');
    let foundDay: Date | null = null;
    let dayRect: DOMRect | null = null;

    dayColEls.forEach(el => {
      const rect = el.getBoundingClientRect();
      if (e.clientX >= rect.left && e.clientX <= rect.right) {
        const dateStr = el.getAttribute('data-daycolumn');
        if (dateStr) {
          foundDay = parseISO(dateStr);
          dayRect = rect;
        }
      }
    });

    if (foundDay && dayRect) {
      // getBoundingClientRect() already accounts for scroll
      const mouseY = e.clientY - (dayRect as DOMRect).top;
      // Snap to 15-minute intervals
      const rawY = mouseY - moveOffset;
      const snapMinutes = 15;
      const pixelsPerMinute = hourHeight / 60;
      const snappedY = Math.round(rawY / (pixelsPerMinute * snapMinutes)) * (pixelsPerMinute * snapMinutes);
      const clampedY = Math.max(0, Math.min(snappedY, totalHours * hourHeight - 15));

      moveCurrentYRef.current = clampedY;
      moveCurrentDayRef.current = foundDay;
      setMoveCurrentY(clampedY);
      setMoveCurrentDay(foundDay);
    }
  }, [moveOffset, hourHeight, totalHours]);

  const handleMoveMouseUp = useCallback(async () => {
    const event = movingEventRef.current;
    const currentDay = moveCurrentDayRef.current;
    const currentY = moveCurrentYRef.current;
    if (!event || !currentDay) {
      setMovingEvent(null);
      movingEventRef.current = null;
      return;
    }

    if (!hasMovedRef.current) {
      // It was a click, not a drag - show event detail
      setMovingEvent(null);
      movingEventRef.current = null;
      setSelectedEvent(event);
      setEditMode(false);
      return;
    }

    // Calculate new start/end times
    const eventDuration = new Date(event.end).getTime() - new Date(event.start).getTime();
    const totalMinutesFromStart = (currentY / hourHeight) * 60;
    const snappedMinutes = Math.round(totalMinutesFromStart / 15) * 15;
    const newStartHour = startHour + Math.floor(snappedMinutes / 60);
    const newStartMin = snappedMinutes % 60;

    const newDateStr = format(currentDay, 'yyyy-MM-dd');
    const newStartTime = `${newDateStr}T${String(newStartHour).padStart(2, '0')}:${String(newStartMin).padStart(2, '0')}:00`;
    const newEnd = new Date(new Date(newStartTime).getTime() + eventDuration);
    const newEndTime = `${format(newEnd, 'yyyy-MM-dd')}T${String(newEnd.getHours()).padStart(2, '0')}:${String(newEnd.getMinutes()).padStart(2, '0')}:00`;

    // Check if anything actually changed
    const origStart = event.start.substring(0, 16);
    const newStart = newStartTime.substring(0, 16);
    if (origStart === newStart) {
      setMovingEvent(null);
      movingEventRef.current = null;
      return;
    }

    // Optimistic update: immediately update local state, then sync with Google in background
    const originalStart = event.start;
    const originalEnd = event.end;
    setEvents(prev => prev.map(e => e.id === event.id ? { ...e, start: newStartTime, end: newEndTime } : e));
    // Also update member events optimistically (same event may appear in team member calendars)
    setMemberEvents(prev => {
      const updated = { ...prev };
      for (const [memberId, evts] of Object.entries(updated)) {
        updated[memberId] = evts.map(e => e.id === event.id ? { ...e, start: newStartTime, end: newEndTime } : e);
      }
      return updated;
    });
    setMovingEvent(null);
    movingEventRef.current = null;

    // Background sync with Google Calendar
    cacheRef.current = null; clearCacheStorage();
    fetch('/api/calendar/events', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ eventId: event.id, startTime: newStartTime, endTime: newEndTime }),
    }).then(async res => {
      if (!res.ok) {
        const errorBody = await res.text().catch(() => '');
        console.error('Failed to move event: API returned', res.status, errorBody);
        // Revert on failure
        setEvents(prev => prev.map(e => e.id === event.id ? { ...e, start: originalStart, end: originalEnd } : e));
        setMemberEvents(prev => {
          const updated = { ...prev };
          for (const [memberId, evts] of Object.entries(updated)) {
            updated[memberId] = evts.map(e => e.id === event.id ? { ...e, start: originalStart, end: originalEnd } : e);
          }
          return updated;
        });
        alert(`予定の移動に失敗しました (${res.status}): Googleカレンダーに反映されませんでした`);
      } else {
        // Re-fetch to sync member calendar changes from Google
        setTimeout(() => { cacheRef.current = null; clearCacheStorage(); fetchEventsRef.current(); }, 2000);
      }
    }).catch((err) => {
      console.error('Failed to move event: network error', err);
      // Revert on network error
      setEvents(prev => prev.map(e => e.id === event.id ? { ...e, start: originalStart, end: originalEnd } : e));
      setMemberEvents(prev => {
        const updated = { ...prev };
        for (const [memberId, evts] of Object.entries(updated)) {
          updated[memberId] = evts.map(e => e.id === event.id ? { ...e, start: originalStart, end: originalEnd } : e);
        }
        return updated;
      });
      alert('ネットワークエラー: 予定の移動に失敗しました');
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hourHeight, startHour]);

  const autoScrollRef = useRef<number>(0);

  const handleMoveTouchMove = useCallback((e: TouchEvent) => {
    e.preventDefault();
    const touch = e.touches[0];
    handleMoveMouseMove({ clientX: touch.clientX, clientY: touch.clientY } as MouseEvent);

    // 自動スクロール: 画面の上端/下端に近づいたらグリッドをスクロール
    const grid = calendarGridRef.current;
    if (!grid) return;
    const gridRect = grid.getBoundingClientRect();
    const edgeThreshold = 60; // px from edge to trigger auto-scroll
    const scrollSpeed = 4; // px per frame

    // 前回の自動スクロールを停止
    if (autoScrollRef.current) { cancelAnimationFrame(autoScrollRef.current); autoScrollRef.current = 0; }

    const clientY = touch.clientY;
    if (clientY < gridRect.top + edgeThreshold) {
      // 上端に近い → 上にスクロール
      const intensity = 1 - Math.max(0, clientY - gridRect.top) / edgeThreshold;
      const tick = () => {
        grid.scrollTop -= scrollSpeed * intensity;
        autoScrollRef.current = requestAnimationFrame(tick);
      };
      autoScrollRef.current = requestAnimationFrame(tick);
    } else if (clientY > gridRect.bottom - edgeThreshold) {
      // 下端に近い → 下にスクロール
      const intensity = 1 - Math.max(0, gridRect.bottom - clientY) / edgeThreshold;
      const tick = () => {
        grid.scrollTop += scrollSpeed * intensity;
        autoScrollRef.current = requestAnimationFrame(tick);
      };
      autoScrollRef.current = requestAnimationFrame(tick);
    }
  }, [handleMoveMouseMove]);

  const handleMoveTouchEnd = useCallback(() => {
    if (autoScrollRef.current) { cancelAnimationFrame(autoScrollRef.current); autoScrollRef.current = 0; }
    handleMoveMouseUp();
  }, [handleMoveMouseUp]);

  // Attach/detach global mouse/touch listeners for event dragging
  useEffect(() => {
    if (movingEvent) {
      window.addEventListener('mousemove', handleMoveMouseMove);
      window.addEventListener('mouseup', handleMoveMouseUp);
      window.addEventListener('touchmove', handleMoveTouchMove, { passive: false });
      window.addEventListener('touchend', handleMoveTouchEnd);
      document.body.style.userSelect = 'none';
      return () => {
        window.removeEventListener('mousemove', handleMoveMouseMove);
        window.removeEventListener('mouseup', handleMoveMouseUp);
        window.removeEventListener('touchmove', handleMoveTouchMove);
        window.removeEventListener('touchend', handleMoveTouchEnd);
        document.body.style.userSelect = '';
      };
    }
  }, [movingEvent, handleMoveMouseMove, handleMoveMouseUp, handleMoveTouchMove, handleMoveTouchEnd]);

  // Keep ref in sync
  useEffect(() => { movingEventRef.current = movingEvent; }, [movingEvent]);
  useEffect(() => { resizingEventRef.current = resizingEvent; }, [resizingEvent]);
  useEffect(() => { resizeEdgeRef.current = resizeEdge; }, [resizeEdge]);

  // ─── Resize Event (drag top/bottom edge) ─────────────

  const handleResizeStart = (event: CalendarEvent, edge: 'top' | 'bottom', e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (event.allDay) return;

    const pos = getEventPosition(event.start, event.end);
    const initialY = edge === 'top' ? pos.top : pos.top + pos.height;

    setResizingEvent(event);
    resizingEventRef.current = event;
    setResizeEdge(edge);
    resizeEdgeRef.current = edge;
    setResizeCurrentY(initialY);
    resizeCurrentYRef.current = initialY;
    hasMovedRef.current = false;
  };

  const handleResizeMouseMove = useCallback((e: MouseEvent) => {
    if (!resizingEventRef.current) return;
    hasMovedRef.current = true;

    const gridEl = calendarGridRef.current;
    if (!gridEl) return;

    // Find the day column for this event
    const eventDay = format(parseISO(resizingEventRef.current.start), 'yyyy-MM-dd');
    const dayColEls = gridEl.querySelectorAll('[data-daycolumn]');
    let dayRect: DOMRect | null = null;
    dayColEls.forEach(el => {
      if (el.getAttribute('data-daycolumn') === eventDay) {
        dayRect = el.getBoundingClientRect();
      }
    });

    if (!dayRect) return;

    // getBoundingClientRect() already accounts for scroll position, so no + scrollTop
    const mouseY = e.clientY - (dayRect as DOMRect).top;
    // Snap to 15-minute intervals
    const snapMinutes = 15;
    const pixelsPerMinute = hourHeight / 60;
    const snappedY = Math.round(mouseY / (pixelsPerMinute * snapMinutes)) * (pixelsPerMinute * snapMinutes);
    // Clamp to prevent going beyond 23:45 (totalHours * hourHeight would be 24:00 which is invalid)
    const maxY = (totalHours - 0.25) * hourHeight; // 23:45
    const clampedY = Math.max(0, Math.min(snappedY, maxY));

    resizeCurrentYRef.current = clampedY;
    setResizeCurrentY(clampedY);
  }, [hourHeight, totalHours]);

  const handleResizeMouseUp = useCallback(async () => {
    const event = resizingEventRef.current;
    if (!event) {
      setResizingEvent(null);
      resizingEventRef.current = null;
      return;
    }

    if (!hasMovedRef.current) {
      setResizingEvent(null);
      resizingEventRef.current = null;
      return;
    }

    // Calculate new time from resizeCurrentYRef (use ref to avoid stale closure)
    const currentY = resizeCurrentYRef.current;
    const totalMinutesFromStart = (currentY / hourHeight) * 60;
    const snappedMinutes = Math.round(totalMinutesFromStart / 15) * 15;
    const newHour = startHour + Math.floor(snappedMinutes / 60);
    const newMin = snappedMinutes % 60;

    const dateStr = format(parseISO(event.start), 'yyyy-MM-dd');
    const newTimeStr = `${dateStr}T${String(newHour).padStart(2, '0')}:${String(newMin).padStart(2, '0')}:00`;

    let newStartTime: string;
    let newEndTime: string;

    if (resizeEdgeRef.current === 'top') {
      // Dragging top edge changes start time
      newStartTime = newTimeStr;
      newEndTime = event.end;
      // Ensure start < end (minimum 15 min)
      if (new Date(newStartTime) >= new Date(newEndTime)) {
        setResizingEvent(null);
        resizingEventRef.current = null;
        return;
      }
    } else {
      // Dragging bottom edge changes end time
      newStartTime = event.start;
      newEndTime = newTimeStr;
      // Ensure start < end (minimum 15 min)
      if (new Date(newEndTime) <= new Date(newStartTime)) {
        setResizingEvent(null);
        resizingEventRef.current = null;
        return;
      }
    }

    // Check if anything actually changed
    const origStart = event.start.substring(0, 16);
    const origEnd = event.end.substring(0, 16);
    const nStart = newStartTime.substring(0, 16);
    const nEnd = newEndTime.substring(0, 16);
    if (origStart === nStart && origEnd === nEnd) {
      setResizingEvent(null);
      resizingEventRef.current = null;
      return;
    }

    // Optimistic update: immediately update local state, then sync with Google in background
    const originalStart = event.start;
    const originalEnd = event.end;
    setEvents(prev => prev.map(e => e.id === event.id ? { ...e, start: newStartTime, end: newEndTime } : e));
    // Also update member events optimistically
    setMemberEvents(prev => {
      const updated = { ...prev };
      for (const [memberId, evts] of Object.entries(updated)) {
        updated[memberId] = evts.map(e => e.id === event.id ? { ...e, start: newStartTime, end: newEndTime } : e);
      }
      return updated;
    });
    setResizingEvent(null);
    resizingEventRef.current = null;

    // Background sync with Google Calendar
    cacheRef.current = null; clearCacheStorage();
    fetch('/api/calendar/events', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ eventId: event.id, startTime: newStartTime, endTime: newEndTime }),
    }).then(async res => {
      if (!res.ok) {
        const errorBody = await res.text().catch(() => '');
        console.error('Failed to resize event: API returned', res.status, errorBody);
        // Revert on failure
        setEvents(prev => prev.map(e => e.id === event.id ? { ...e, start: originalStart, end: originalEnd } : e));
        setMemberEvents(prev => {
          const updated = { ...prev };
          for (const [memberId, evts] of Object.entries(updated)) {
            updated[memberId] = evts.map(e => e.id === event.id ? { ...e, start: originalStart, end: originalEnd } : e);
          }
          return updated;
        });
        alert(`予定のリサイズに失敗しました (${res.status}): Googleカレンダーに反映されませんでした`);
      } else {
        // Re-fetch to sync member calendar changes from Google
        setTimeout(() => { cacheRef.current = null; clearCacheStorage(); fetchEventsRef.current(); }, 2000);
      }
    }).catch((err) => {
      console.error('Failed to resize event: network error', err);
      // Revert on network error
      setEvents(prev => prev.map(e => e.id === event.id ? { ...e, start: originalStart, end: originalEnd } : e));
      setMemberEvents(prev => {
        const updated = { ...prev };
        for (const [memberId, evts] of Object.entries(updated)) {
          updated[memberId] = evts.map(e => e.id === event.id ? { ...e, start: originalStart, end: originalEnd } : e);
        }
        return updated;
      });
      alert('ネットワークエラー: 予定のリサイズに失敗しました');
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hourHeight, startHour]);

  const handleResizeTouchMove = useCallback((e: TouchEvent) => {
    e.preventDefault();
    const touch = e.touches[0];
    handleResizeMouseMove({ clientX: touch.clientX, clientY: touch.clientY } as MouseEvent);

    // 自動スクロール（リサイズ時）
    const grid = calendarGridRef.current;
    if (!grid) return;
    const gridRect = grid.getBoundingClientRect();
    const edgeThreshold = 60;
    const scrollSpeed = 4;
    if (autoScrollRef.current) { cancelAnimationFrame(autoScrollRef.current); autoScrollRef.current = 0; }
    const clientY = touch.clientY;
    if (clientY < gridRect.top + edgeThreshold) {
      const intensity = 1 - Math.max(0, clientY - gridRect.top) / edgeThreshold;
      const tick = () => { grid.scrollTop -= scrollSpeed * intensity; autoScrollRef.current = requestAnimationFrame(tick); };
      autoScrollRef.current = requestAnimationFrame(tick);
    } else if (clientY > gridRect.bottom - edgeThreshold) {
      const intensity = 1 - Math.max(0, gridRect.bottom - clientY) / edgeThreshold;
      const tick = () => { grid.scrollTop += scrollSpeed * intensity; autoScrollRef.current = requestAnimationFrame(tick); };
      autoScrollRef.current = requestAnimationFrame(tick);
    }
  }, [handleResizeMouseMove]);

  const handleResizeTouchEnd = useCallback(() => {
    if (autoScrollRef.current) { cancelAnimationFrame(autoScrollRef.current); autoScrollRef.current = 0; }
    handleResizeMouseUp();
  }, [handleResizeMouseUp]);

  // Attach/detach global mouse/touch listeners for event resizing
  useEffect(() => {
    if (resizingEvent) {
      window.addEventListener('mousemove', handleResizeMouseMove);
      window.addEventListener('mouseup', handleResizeMouseUp);
      window.addEventListener('touchmove', handleResizeTouchMove, { passive: false });
      window.addEventListener('touchend', handleResizeTouchEnd);
      document.body.style.userSelect = 'none';
      return () => {
        window.removeEventListener('mousemove', handleResizeMouseMove);
        window.removeEventListener('mouseup', handleResizeMouseUp);
        window.removeEventListener('touchmove', handleResizeTouchMove);
        window.removeEventListener('touchend', handleResizeTouchEnd);
        document.body.style.userSelect = '';
      };
    }
  }, [resizingEvent, handleResizeMouseMove, handleResizeMouseUp, handleResizeTouchMove, handleResizeTouchEnd]);

  const saveOverride = async () => {
    if (!selectedDay) return;
    try {
      const res = await fetch('/api/availability/overrides', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: format(selectedDay, 'yyyy-MM-dd'),
          isBlocked: overrideType === 'blocked',
          startTime: overrideType === 'available' ? overrideStart : null,
          endTime: overrideType === 'available' ? overrideEnd : null,
        }),
      });
      if (res.ok) { setShowOverrideModal(false); cacheRef.current = null; clearCacheStorage(); fetchEvents(); }
    } catch (err) { console.error('Failed to save override:', err); }
  };

  // ─── Drag Handlers ────────────────────────────────────

  const handleMouseDown = (day: Date, e: React.MouseEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('[data-event]')) return;
    if (movingEvent || resizingEvent) return; // Don't create while moving/resizing
    const rect = e.currentTarget.getBoundingClientRect();
    // getBoundingClientRect() already accounts for scroll position
    const y = e.clientY - rect.top;
    hasMovedRef.current = false;
    setIsDragging(true);
    setDragStart({ day, y });
    setDragEnd({ y });
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDragging || !dragStart) return;
    hasMovedRef.current = true;
    const rect = e.currentTarget.getBoundingClientRect();
    const y = Math.max(0, Math.min(e.clientY - rect.top, totalHours * hourHeight));
    setDragEnd({ y });
  };

  const handleMouseUp = () => {
    if (!isDragging || !dragStart || !dragEnd) {
      setIsDragging(false);
      return;
    }

    if (!hasMovedRef.current || Math.abs(dragStart.y - dragEnd.y) < 10) {
      // It was a click, not a drag
      if (!isMobile) {
        // Desktop only: open new event form at clicked position
        const clickTime = yToTime(dragStart.y);
        const [hh, mm] = clickTime.split(':').map(Number);
        const endMinutes = hh * 60 + mm + 60;
        const endH = Math.min(Math.floor(endMinutes / 60), startHour + totalHours);
        const endM = endMinutes % 60;
        const endTime = `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;
        const dateStr = format(dragStart.day, 'yyyy-MM-dd');
        setNewEventForm({
          summary: '', description: '',
          startDate: dateStr, startTimeStr: clickTime,
          endDate: dateStr, endTimeStr: endTime,
          locationType: 'online', location: '', reminderMinutes: 10,
        });
        setShowNewEventForm(true);
      }
      // Mobile: single tap does nothing (only drag creates events)
      setIsDragging(false);
      setDragStart(null);
      setDragEnd(null);
      return;
    }

    const startY = Math.min(dragStart.y, dragEnd.y);
    const endY = Math.max(dragStart.y, dragEnd.y);
    const rangeStart = yToTime(startY);
    const rangeEnd = yToTime(endY);

    if (rangeStart !== rangeEnd) {
      const dateStr = format(dragStart.day, 'yyyy-MM-dd');
      setNewEventForm({
        summary: '',
        description: '',
        startDate: dateStr, startTimeStr: rangeStart,
        endDate: dateStr, endTimeStr: rangeEnd,
        locationType: 'online',
        location: '',
        reminderMinutes: 10,
      });
      setShowNewEventForm(true);
    }

    setIsDragging(false);
    setDragStart(null);
    setDragEnd(null);
  };

  // Keep handleMouseUpRef in sync for native touch listener
  handleMouseUpRef.current = handleMouseUp;

  // ─── Render ───────────────────────────────────────────

  return (
    <div className="-mx-4 sm:-mx-6 lg:-mx-8 -mb-20 md:-mb-8 -mt-8 md:px-4 md:sm:px-6 lg:px-8 h-[calc(100dvh-52px)] md:h-[calc(100vh-64px)] flex flex-col pt-0 md:pt-3 overflow-hidden">
      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/50 z-40 md:hidden" onClick={() => setSidebarOpen(false)}>
          <div className="absolute left-0 top-0 bottom-0 w-72 bg-white p-4 overflow-y-auto shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <div className="relative flex-1">
                <Filter className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input type="text" value={filterText} onChange={e => setFilterText(e.target.value)}
                  placeholder="検索..."
                  className="pl-9 pr-3 py-1.5 border border-gray-300 rounded-lg text-sm text-gray-700 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 w-full" />
              </div>
              <button onClick={() => setSidebarOpen(false)} className="p-1 hover:bg-gray-100 rounded-lg ml-2">
                <X className="w-5 h-5 text-gray-700" />
              </button>
            </div>
            {/* Calendar sources - mobile */}
            <div className="space-y-2">
              <p className="text-xs font-medium text-gray-500">同期カレンダー</p>
              {filteredSources.filter(s => s.type === 'google' || s.type === 'member').map(source => (
                <div key={source.id} className="relative">
                  <div className="flex items-center gap-2 w-full text-left py-1.5 px-2 rounded-lg hover:bg-gray-50 text-sm text-gray-700">
                    <span className="w-3 h-3 rounded-sm shrink-0 cursor-pointer hover:ring-2 hover:ring-offset-1 hover:ring-gray-300 transition-all"
                      style={{ backgroundColor: source.color }}
                      onClick={e => { e.stopPropagation(); setColorPickerSourceId(colorPickerSourceId === source.id ? null : source.id); }} />
                    <button className="flex items-center gap-2 flex-1 min-w-0" onClick={() => toggleSource(source.id)}>
                      <span className="truncate flex-1 text-left">{source.name}</span>
                      {source.visible ? <Eye className="w-3.5 h-3.5 text-gray-400" /> : <EyeOff className="w-3.5 h-3.5 text-gray-300" />}
                    </button>
                  </div>
                  {colorPickerSourceId === source.id && (
                    <div className="absolute left-2 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg p-2 z-50 grid grid-cols-5 gap-1.5">
                      {PICKER_COLORS.map(c => (
                        <button key={c} onClick={() => changeSourceColor(source.id, c)}
                          className={`w-6 h-6 rounded-full hover:scale-110 transition-transform ${source.color === c ? 'ring-2 ring-offset-1 ring-gray-400' : ''}`}
                          style={{ backgroundColor: c }} />
                      ))}
                    </div>
                  )}
                </div>
              ))}
              <p className="text-xs font-medium text-gray-500 pt-2">予約リンク</p>
              {filteredSources.filter(s => s.type === 'booking').map(source => (
                <div key={source.id} className="relative">
                  <div className="flex items-center gap-2 w-full text-left py-1.5 px-2 rounded-lg hover:bg-gray-50 text-sm text-gray-700">
                    <span className="w-3 h-3 rounded-sm shrink-0 cursor-pointer hover:ring-2 hover:ring-offset-1 hover:ring-gray-300 transition-all"
                      style={{ backgroundColor: source.color }}
                      onClick={e => { e.stopPropagation(); setColorPickerSourceId(colorPickerSourceId === source.id ? null : source.id); }} />
                    <button className="flex items-center gap-2 flex-1 min-w-0" onClick={() => toggleSource(source.id)} title={source.name}>
                      <span className="truncate flex-1 text-left">{source.name}</span>
                      {source.visible ? <Eye className="w-3.5 h-3.5 text-gray-400" /> : <EyeOff className="w-3.5 h-3.5 text-gray-300" />}
                    </button>
                  </div>
                  {colorPickerSourceId === source.id && (
                    <div className="absolute left-2 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg p-2 z-50 grid grid-cols-5 gap-1.5">
                      {PICKER_COLORS.map(c => (
                        <button key={c} onClick={() => changeSourceColor(source.id, c)}
                          className={`w-6 h-6 rounded-full hover:scale-110 transition-transform ${source.color === c ? 'ring-2 ring-offset-1 ring-gray-400' : ''}`}
                          style={{ backgroundColor: c }} />
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="flex gap-0 md:gap-3 flex-1 min-h-0">
        {/* Left Sidebar - desktop only, collapsible */}
        <div className={`hidden md:flex flex-col shrink-0 transition-all duration-200 ${sidebarCollapsed ? 'w-0' : 'w-52'}`}>
          {!sidebarCollapsed && (
            <div className="bg-white rounded-xl border border-gray-200 p-3 overflow-y-auto flex-1">
              {/* Search */}
              <div className="relative mb-3">
                <Filter className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                <input type="text" value={filterText} onChange={e => setFilterText(e.target.value)}
                  placeholder="検索..."
                  className="pl-8 pr-3 py-1.5 border border-gray-300 rounded-lg text-xs text-gray-700 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 w-full" />
                {filterText && (
                  <button onClick={() => setFilterText('')} className="absolute right-2 top-1/2 -translate-y-1/2">
                    <X className="w-3 h-3 text-gray-400 hover:text-gray-600" />
                  </button>
                )}
              </div>

              {/* Select all / deselect all */}
              <div className="flex items-center gap-1 mb-2">
                <button onClick={selectAll} className={`p-0.5 rounded transition-colors ${allVisible ? 'text-blue-600' : 'text-gray-400 hover:text-gray-600'}`} title="全選択">
                  <CheckSquare className="w-3.5 h-3.5" />
                </button>
                <button onClick={deselectAll} className={`p-0.5 rounded transition-colors ${noneVisible ? 'text-blue-600' : 'text-gray-400 hover:text-gray-600'}`} title="全解除">
                  <Square className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Calendar sources */}
              <div className="mb-2">
                <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wider mb-1">同期カレンダー</p>
                {filteredSources.filter(s => s.type === 'google' || s.type === 'member').map(source => (
                  <div key={source.id} className="relative">
                    <div className="flex items-center gap-2 w-full px-1.5 py-1 rounded-lg hover:bg-gray-50 transition-colors text-left">
                      <div className="w-2.5 h-2.5 rounded-sm shrink-0 cursor-pointer hover:ring-2 hover:ring-offset-1 hover:ring-gray-300 transition-all"
                        style={{ backgroundColor: source.visible ? source.color : '#d1d5db', opacity: source.visible ? 1 : 0.4 }}
                        onClick={e => { e.stopPropagation(); setColorPickerSourceId(colorPickerSourceId === source.id ? null : source.id); }} />
                      <button className="flex items-center gap-2 flex-1 min-w-0" onClick={() => toggleSource(source.id)}>
                        <span className={`text-xs truncate ${source.visible ? 'text-gray-800' : 'text-gray-400'}`}>{source.name}</span>
                        {source.visible ? <Eye className="w-3 h-3 text-gray-400 ml-auto shrink-0" /> : <EyeOff className="w-3 h-3 text-gray-300 ml-auto shrink-0" />}
                      </button>
                    </div>
                    {colorPickerSourceId === source.id && (
                      <div className="absolute left-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg p-2 z-50 grid grid-cols-5 gap-1.5">
                        {PICKER_COLORS.map(c => (
                          <button key={c} onClick={() => changeSourceColor(source.id, c)}
                            className={`w-5 h-5 rounded-full hover:scale-110 transition-transform ${source.color === c ? 'ring-2 ring-offset-1 ring-gray-400' : ''}`}
                            style={{ backgroundColor: c }} />
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {filteredSources.filter(s => s.type === 'booking').length > 0 && (
                <div>
                  <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wider mb-1">予約リンク</p>
                  {filteredSources.filter(s => s.type === 'booking').map(source => (
                    <div key={source.id} className="relative">
                      <div className="flex items-center gap-2 w-full px-1.5 py-1 rounded-lg hover:bg-gray-50 transition-colors text-left">
                        <div className="w-2.5 h-2.5 rounded-sm shrink-0 cursor-pointer hover:ring-2 hover:ring-offset-1 hover:ring-gray-300 transition-all"
                          style={{ backgroundColor: source.visible ? source.color : '#d1d5db', opacity: source.visible ? 1 : 0.4 }}
                          onClick={e => { e.stopPropagation(); setColorPickerSourceId(colorPickerSourceId === source.id ? null : source.id); }} />
                        <button className="flex items-center gap-2 flex-1 min-w-0" onClick={() => toggleSource(source.id)} title={source.name}>
                          <span className={`text-xs truncate ${source.visible ? 'text-gray-800' : 'text-gray-400'}`}>{source.name}</span>
                          {source.visible ? <Eye className="w-3 h-3 text-gray-400 ml-auto shrink-0" /> : <EyeOff className="w-3 h-3 text-gray-300 ml-auto shrink-0" />}
                        </button>
                      </div>
                      {colorPickerSourceId === source.id && (
                        <div className="absolute left-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg p-2 z-50 grid grid-cols-5 gap-1.5">
                          {PICKER_COLORS.map(c => (
                            <button key={c} onClick={() => changeSourceColor(source.id, c)}
                              className={`w-5 h-5 rounded-full hover:scale-110 transition-transform ${source.color === c ? 'ring-2 ring-offset-1 ring-gray-400' : ''}`}
                              style={{ backgroundColor: c }} />
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {filteredSources.length === 0 && filterText && (
                <p className="text-xs text-gray-500 py-2 text-center">該当なし</p>
              )}
            </div>
          )}
        </div>

        {/* Calendar Grid */}
        <div className="flex-1 bg-white md:rounded-xl md:shadow-sm md:border md:border-gray-200 overflow-hidden flex flex-col min-h-0">
          {/* Mobile Header - Google Calendar style */}
          {isMobile && (
            <div className="flex items-center px-3 py-2 border-b border-gray-200 shrink-0">
              <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-1.5 -ml-1 hover:bg-gray-100 rounded-full">
                <Menu className="w-5 h-5 text-gray-600" />
              </button>
              <button className="flex items-center gap-1 ml-2 text-lg font-medium text-gray-900"
                onClick={() => {
                  setMonthPickerDate(currentWeekStart);
                  setShowMonthPicker(!showMonthPicker);
                }}>
                {format(currentWeekStart, 'M月', { locale: ja })}
                <ChevronRight className={`w-4 h-4 text-gray-400 transition-transform ${showMonthPicker ? 'rotate-[270deg]' : 'rotate-90'}`} />
              </button>
              <div className="flex-1" />
              <button onClick={() => {
                const now = new Date(); now.setHours(0,0,0,0);
                setCurrentWeekStart(now);
              }}
                className="p-1.5 hover:bg-gray-100 rounded-full mr-1"
                title="今日">
                <div className="w-5 h-5 flex items-center justify-center text-[10px] font-bold text-blue-600 border border-blue-600 rounded">
                  {format(new Date(), 'd')}
                </div>
              </button>
              <div className="flex items-center gap-0.5 mr-1">
                <button onClick={() => setHourHeight(h => Math.max(20, h - 8))} className="p-1 hover:bg-gray-100 rounded-full" title="縮小">
                  <Minus className="w-3.5 h-3.5 text-gray-500" />
                </button>
                <button onClick={() => setHourHeight(h => Math.min(100, h + 8))} className="p-1 hover:bg-gray-100 rounded-full" title="拡大">
                  <Plus className="w-3.5 h-3.5 text-gray-500" />
                </button>
              </div>
              <select value={viewDays}
                onChange={e => {
                  const newDays = Number(e.target.value) as typeof viewDays;
                  setViewDays(newDays);
                  cacheRef.current = null; clearCacheStorage();
                  const now = new Date(); now.setHours(0,0,0,0);
                  if (newDays >= 7) {
                    const day = now.getDay();
                    const diff = day === 0 ? -6 : 1 - day;
                    const m = new Date(now); m.setDate(now.getDate() + diff);
                    setCurrentWeekStart(m);
                  } else setCurrentWeekStart(now);
                }}
                className="text-xs border border-gray-200 rounded-full px-2 py-1 text-gray-600">
                <option value={1}>1日</option>
                <option value={3}>3日</option>
                <option value={7}>週</option>
              </select>
            </div>
          )}

          {/* Month Picker Dropdown (mobile) */}
          {isMobile && showMonthPicker && (
            <div className="border-b border-gray-200 bg-white shrink-0 z-20">
              {/* Mini Calendar */}
              <div className="px-3 pt-2 pb-1">
                {(() => {
                  const monthStart = startOfMonth(monthPickerDate);
                  const calStart = startOfWeek(monthStart, { weekStartsOn: 0 });
                  const calEnd = endOfWeek(endOfMonth(monthPickerDate), { weekStartsOn: 0 });
                  const days: Date[] = [];
                  let d = calStart;
                  while (d <= calEnd) { days.push(d); d = addDays(d, 1); }
                  const dayNames = ['日', '月', '火', '水', '木', '金', '土'];
                  return (
                    <>
                      <div className="grid grid-cols-7 gap-0">
                        {dayNames.map((name, i) => (
                          <div key={name} className={`text-center text-[11px] font-medium py-1 ${i === 0 ? 'text-red-400' : i === 6 ? 'text-blue-400' : 'text-gray-400'}`}>{name}</div>
                        ))}
                        {days.map(day => {
                          const isCurrentMonth = isSameMonth(day, monthPickerDate);
                          const isToday = isSameDay(day, new Date());
                          const isSun = day.getDay() === 0;
                          const isSat = day.getDay() === 6;
                          const hol = isJapaneseHoliday(format(day, 'yyyy-MM-dd'));
                          return (
                            <button
                              key={day.toISOString()}
                              onClick={() => {
                                const target = new Date(day);
                                target.setHours(0, 0, 0, 0);
                                if (viewDays >= 7) {
                                  const wd = target.getDay();
                                  const diff = wd === 0 ? -6 : 1 - wd;
                                  target.setDate(target.getDate() + diff);
                                }
                                setCurrentWeekStart(target);
                                setShowMonthPicker(false);
                              }}
                              className={`text-center py-1.5 text-sm rounded-full mx-auto w-8 h-8 flex items-center justify-center ${
                                !isCurrentMonth ? 'text-gray-300' :
                                isToday ? 'bg-blue-600 text-white font-bold' :
                                isSun || hol ? 'text-red-500' :
                                isSat ? 'text-blue-500' :
                                'text-gray-800'
                              }`}
                            >
                              {format(day, 'd')}
                            </button>
                          );
                        })}
                      </div>
                    </>
                  );
                })()}
              </div>
              {/* Month tabs */}
              <div className="flex gap-1 px-3 pb-2 overflow-x-auto">
                {Array.from({ length: 12 }, (_, i) => {
                  const m = addMonths(startOfMonth(new Date()), i - 2);
                  const isActive = isSameMonth(m, monthPickerDate);
                  return (
                    <button key={i}
                      onClick={() => setMonthPickerDate(m)}
                      className={`px-3 py-1 text-sm rounded-full whitespace-nowrap font-medium transition-colors ${
                        isActive ? 'bg-blue-100 text-blue-700' : 'text-gray-500 hover:bg-gray-100'
                      }`}
                    >
                      {format(m, 'M月')}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Desktop Navigation Bar */}
          {!isMobile && (
            <div className="flex items-center px-3 py-2 border-b border-gray-200 shrink-0 gap-2">
              <button onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                className="p-1 hover:bg-gray-100 rounded-lg transition-colors text-gray-400 hover:text-gray-600 shrink-0"
                title={sidebarCollapsed ? 'サイドバーを表示' : 'サイドバーを非表示'}>
                {sidebarCollapsed ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
              </button>

              <button onClick={() => setCurrentWeekStart(prev => addDays(prev, -viewDays))}
                className="p-1 hover:bg-gray-100 rounded-lg transition-colors shrink-0"
                title={`${viewDays}日戻る`}>
                <ChevronLeft className="w-5 h-5 text-gray-600" />
              </button>

              <span className="text-sm font-medium text-gray-900 whitespace-nowrap">
                {viewDays === 1
                  ? format(currentWeekStart, 'yyyy年M月d日(E)', { locale: ja })
                  : `${format(currentWeekStart, 'yyyy年M月d日', { locale: ja })} - ${format(addDays(currentWeekStart, viewDays - 1), 'M月d日', { locale: ja })}`}
              </span>

              <button onClick={() => setCurrentWeekStart(prev => addDays(prev, viewDays))}
                className="p-1 hover:bg-gray-100 rounded-lg transition-colors shrink-0"
                title={`${viewDays}日進む`}>
                <ChevronRight className="w-5 h-5 text-gray-600" />
              </button>

              <div className="flex-1" />

              <button onClick={() => {
                const now = new Date();
                const dateStr = format(now, 'yyyy-MM-dd');
                const hour = now.getHours();
                const nextHour = hour + 1;
                setNewEventForm({
                  summary: '',
                  description: '',
                  startDate: dateStr, startTimeStr: `${String(hour).padStart(2, '0')}:00`,
                  endDate: dateStr, endTimeStr: `${String(nextHour).padStart(2, '0')}:00`,
                  locationType: 'online',
                  location: '',
                  reminderMinutes: 10,
                });
                setShowNewEventForm(true);
              }}
                className="flex items-center gap-1 text-xs px-2 py-1 bg-blue-600 text-white rounded-lg hover:bg-blue-700 shrink-0 font-medium">
                <Plus className="w-3.5 h-3.5" /> 予定追加
              </button>

              <button onClick={() => { setCurrentWeekStart(() => {
                const now = new Date();
                now.setHours(0,0,0,0);
                if (viewDays >= 7) {
                  const day = now.getDay();
                  const diff = day === 0 ? -6 : 1 - day;
                  const m = new Date(now);
                  m.setDate(now.getDate() + diff);
                  return m;
                }
                return now;
              }); }}
                className="text-xs px-2 py-1 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 shrink-0">今日</button>
              <select value={viewDays}
                onChange={e => {
                  const newDays = Number(e.target.value) as typeof viewDays;
                  setViewDays(newDays);
                  cacheRef.current = null; clearCacheStorage();
                  const now = new Date();
                  now.setHours(0,0,0,0);
                  if (newDays >= 7) {
                    const day = now.getDay();
                    const diff = day === 0 ? -6 : 1 - day;
                    const m = new Date(now);
                    m.setDate(now.getDate() + diff);
                    setCurrentWeekStart(m);
                  } else {
                    setCurrentWeekStart(now);
                  }
                }}
                className="text-xs border border-gray-300 rounded-lg px-1.5 py-1 text-gray-700 shrink-0">
                <option value={1}>1日</option>
                <option value={3}>3日</option>
                <option value={7}>1週間</option>
                <option value={10}>10日</option>
                <option value={14}>2週間</option>
              </select>
              <label className="flex items-center gap-1 text-xs text-gray-600 cursor-pointer whitespace-nowrap shrink-0">
                <input type="checkbox" checked={freeScroll} onChange={e => setFreeScroll(e.target.checked)}
                  className="w-3 h-3 rounded text-blue-600" />
                横スクロール
              </label>
            </div>
          )}

          {/* Calendar Body */}
          {initialLoad && loading ? (
            <div className="flex items-center justify-center h-96">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
            </div>
          ) : (
            <div className="overflow-auto relative flex-1" ref={(el) => {
              calendarGridRef.current = el;
              if (el && !gridReady) setGridReady(true);
            }}>
              {(loading && !initialLoad) && (
                <div className="absolute top-2 right-2 z-50 flex items-center gap-1.5 bg-white/90 rounded-lg px-2 py-1 shadow-sm border border-gray-200">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600" />
                </div>
              )}

              {/* Day Headers */}
              <div className="border-b border-gray-200 sticky top-0 bg-white z-30"
                style={{ display: 'grid', gridTemplateColumns: `${isMobile ? '36px' : '48px'} repeat(${viewDays}, 1fr)` }}>
                <div className={isMobile ? 'w-9' : 'w-12'} />
                {weekDays.map(day => {
                  const isToday = isSameDay(day, new Date());
                  const sat = isSaturday(day);
                  const sun = isSunday(day);
                  const hol = isHoliday(day);
                  const dayNameColor = sun || hol ? 'text-red-500' : sat ? 'text-blue-500' : isToday ? 'text-blue-600' : 'text-gray-500';
                  const dayNumColor = isToday ? 'text-white' : sun || hol ? 'text-red-500' : sat ? 'text-blue-500' : 'text-gray-900';
                  return (
                    <div key={day.toISOString()}
                      className={`text-center py-1.5 md:py-2 cursor-pointer hover:bg-gray-50`}
                      onClick={() => { setSelectedDay(day); setShowOverrideModal(true); }}>
                      <div className={`text-[11px] md:text-xs font-medium ${dayNameColor}`}>{format(day, 'EEE', { locale: ja })}</div>
                      <div className={`text-base md:text-lg font-semibold mt-0.5 ${dayNumColor}`}>
                        {isToday ? (
                          <span className="inline-flex items-center justify-center w-8 h-8 md:w-7 md:h-7 rounded-full bg-blue-600">{format(day, 'd')}</span>
                        ) : (
                          format(day, 'd')
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Time Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: `${isMobile ? '36px' : '48px'} repeat(${viewDays}, 1fr)`, position: 'relative' }}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={() => { if (isDragging) { setIsDragging(false); setDragStart(null); setDragEnd(null); } }}>
                {/* Time labels column */}
                <div style={{ gridColumn: 1, gridRow: `1 / ${totalHours + 1}`, position: 'relative' }} className="border-r border-gray-100">
                  {hours.map(hour => (
                    <div key={`time-${hour}`} className="text-right pr-1 md:pr-2 relative" style={{ height: `${hourHeight}px` }}>
                      <span className={`text-gray-400 absolute -top-2 right-1 md:right-2 ${isMobile ? 'text-[10px]' : 'text-xs'}`}>{String(hour).padStart(2, '0')}:00</span>
                    </div>
                  ))}
                  {/* Current time label */}
                  {currentTimePos !== null && weekDays.some(d => isSameDay(d, new Date())) && (
                    <div className="absolute right-1 md:right-2 z-30 pointer-events-none" style={{ top: `${currentTimePos - 6}px` }}>
                      <span className={`text-red-500 font-bold ${isMobile ? 'text-[10px]' : 'text-xs'}`}>{format(new Date(), 'HH:mm')}</span>
                    </div>
                  )}
                </div>

                {/* Day columns */}
                {weekDays.map((day, dayIdx) => {
                  const isToday = isSameDay(day, new Date());
                  const dayOff = isDayOff(day);
                  // Background: today gets blue tint, weekends/holidays get gray tint
                  const dayBg = isToday ? 'bg-blue-50/50' : dayOff ? 'bg-gray-50/70' : '';
                  return (
                  <div key={day.toISOString()} data-daycolumn={format(day, 'yyyy-MM-dd')} className={`${dayBg} select-none`} style={{ gridColumn: dayIdx + 2, gridRow: `1 / ${totalHours + 1}`, position: 'relative', WebkitUserSelect: 'none', WebkitTouchCallout: 'none', touchAction: 'none' }}
                    onMouseDown={e => handleMouseDown(day, e)}>

                    {/* Hour grid lines */}
                    {hours.map(hour => (
                      <div key={`grid-${hour}`} className="border-t border-l border-gray-100" style={{ height: `${hourHeight}px` }} />
                    ))}

                    {/* Current time indicator */}
                    {isToday && currentTimePos !== null && (
                      <div className="absolute left-0 right-0 z-30 pointer-events-none" style={{ top: `${currentTimePos}px` }}>
                        <div className="relative">
                          <div className="absolute -left-[5px] -top-[5px] w-[10px] h-[10px] rounded-full bg-red-500" />
                          <div className="absolute left-0 right-0 h-[2px] bg-red-500" />
                        </div>
                      </div>
                    )}

                    {/* Availability windows */}
                    {availabilityWindows
                      .filter(w => w.dayOfWeek === day.getDay())
                      .map((w, wIdx) => {
                        const wStart = parseInt(w.start.split(':')[0]) + parseInt(w.start.split(':')[1]) / 60;
                        const wEnd = parseInt(w.end.split(':')[0]) + parseInt(w.end.split(':')[1]) / 60;
                        return (
                          <div key={`aw-${wIdx}`} className="absolute left-0 right-0 bg-green-50/40 pointer-events-none"
                            style={{ top: `${(wStart - startHour) * hourHeight}px`, height: `${(wEnd - wStart) * hourHeight}px` }} />
                        );
                      })}

                    {/* All-day events - fill entire visible time range */}
                    {isGoogleVisible && getDayAllDayEvents(day).map((event, idx) => (
                      <div key={`allday-${event.id}`} data-event="true"
                        className="absolute left-0.5 right-0.5 rounded px-1 py-0.5 text-xs cursor-pointer overflow-hidden z-10 bg-purple-100 border border-purple-300 text-purple-800 opacity-60"
                        style={{ top: 0, height: `${totalHours * hourHeight}px` }}
                        onClick={e => { e.stopPropagation(); setSelectedEvent(event); setEditMode(false); }}>
                        <div className="font-medium truncate sticky top-1">{event.summary}</div>
                        <div className="text-[10px] opacity-75 sticky top-5">終日</div>
                      </div>
                    ))}

                    {/* All events with side-by-side layout */}
                    {getDayLayout(day).map(item => {
                      const pos = getEventPosition(item.start, item.end);
                      const colWidth = 100 / item.totalCols;
                      const leftPercent = item.col * colWidth;

                      // Google Calendar event
                      if (item.source === 'google' && item.event) {
                        const event = item.event;
                        const isBeingMoved = movingEvent?.id === event.id;
                        const isBeingResized = resizingEvent?.id === event.id;

                        let liveTop = pos.top;
                        let liveHeight = pos.height;
                        let liveStartStr = format(parseISO(event.start), 'HH:mm');
                        let liveEndStr = format(parseISO(event.end), 'HH:mm');
                        if (isBeingResized) {
                          if (resizeEdge === 'top') {
                            liveTop = Math.min(resizeCurrentY, pos.top + pos.height - hourHeight / 4);
                            liveHeight = (pos.top + pos.height) - liveTop;
                          } else {
                            const newBottom = Math.max(resizeCurrentY, pos.top + hourHeight / 4);
                            liveHeight = newBottom - pos.top;
                          }
                          const tMin = Math.round((liveTop / hourHeight) * 60 / 15) * 15;
                          const tH = startHour + Math.floor(tMin / 60);
                          const tM = tMin % 60;
                          liveStartStr = `${String(tH).padStart(2, '0')}:${String(tM).padStart(2, '0')}`;
                          const bMin = Math.round(((liveTop + liveHeight) / hourHeight) * 60 / 15) * 15;
                          const bH = startHour + Math.floor(bMin / 60);
                          const bM = bMin % 60;
                          liveEndStr = `${String(bH).padStart(2, '0')}:${String(bM).padStart(2, '0')}`;
                        }

                        const gColor = getGoogleColor();
                        return (
                          <div key={event.id} data-event="true"
                            className={`absolute rounded px-1 text-xs overflow-hidden z-20 group border ${
                              isBeingMoved ? 'opacity-30 cursor-grabbing' : isBeingResized ? 'shadow-lg border-2 z-30' : 'cursor-grab'
                            }`}
                            style={{ top: `${liveTop}px`, height: `${Math.max(20, liveHeight)}px`, minHeight: '20px', left: `${leftPercent}%`, width: `${colWidth}%`, backgroundColor: `${gColor}20`, borderColor: isBeingResized ? gColor : `${gColor}60`, color: gColor }}
                            onMouseDown={e => { handleEventDragStart(event, e); handleEventMouseLeave(); }}
                            onTouchStart={e => handleEventTouchStart(event, e)}
                            onTouchEnd={handleEventTouchEnd}
                            onTouchMove={handleEventTouchMove}
                            onMouseEnter={e => handleEventMouseEnter(e, event, 'google')}
                            onMouseLeave={handleEventMouseLeave}>
                            <div className="absolute top-0 left-0 right-0 h-3 cursor-ns-resize z-30 rounded-t group/resize-top"
                              onMouseDown={e => handleResizeStart(event, 'top', e)}>
                              <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-6 h-1 rounded-full bg-blue-500/0 group-hover/resize-top:bg-blue-500/60 transition-colors" />
                            </div>
                            <div className="py-0.5 pointer-events-none select-none overflow-hidden h-full">
                              <div className="font-semibold leading-tight break-words overflow-hidden" style={{ fontSize: '11px', display: '-webkit-box', WebkitLineClamp: Math.max(1, Math.floor(Math.max(20, liveHeight) / 14)), WebkitBoxOrient: 'vertical' as const }}>{event.summary}</div>
                            </div>
                            <div className="absolute bottom-0 left-0 right-0 h-3 cursor-ns-resize z-30 rounded-b group/resize-bottom"
                              onMouseDown={e => handleResizeStart(event, 'bottom', e)}>
                              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-6 h-1 rounded-full bg-blue-500/0 group-hover/resize-bottom:bg-blue-500/60 transition-colors" />
                            </div>
                          </div>
                        );
                      }

                      // Booking event
                      if (item.source === 'booking' && item.booking) {
                        const booking = item.booking;
                        const color = getBookingColor(booking.event_type_id);
                        return (
                          <div key={booking.id} data-event="true"
                            className="absolute rounded px-1 py-0.5 text-xs cursor-pointer overflow-hidden z-20 border"
                            style={{ top: `${pos.top}px`, height: `${pos.height}px`, minHeight: '15px', left: `${leftPercent}%`, width: `${colWidth}%`, backgroundColor: `${color}20`, borderColor: `${color}80`, color }}
                            onClick={e => { e.stopPropagation(); setSelectedBooking(booking); handleEventMouseLeave(); }}
                            onMouseEnter={e => handleEventMouseEnter(e, booking, 'booking')}
                            onMouseLeave={handleEventMouseLeave}>
                            <div className="font-semibold leading-tight break-words overflow-hidden" style={{ fontSize: '11px', display: '-webkit-box', WebkitLineClamp: Math.max(1, Math.floor(pos.height / 14)), WebkitBoxOrient: 'vertical' as const }}>{booking.guest_name}</div>
                          </div>
                        );
                      }

                      // Member event (draggable like Google events)
                      if (item.source === 'member' && item.event) {
                        const event = item.event;
                        const color = getMemberColor(item.memberId || '');
                        const isBeingMoved = movingEvent?.id === event.id;
                        const isBeingResized = resizingEvent?.id === event.id;

                        let mLiveTop = pos.top;
                        let mLiveHeight = pos.height;
                        let mLiveStartStr = format(parseISO(event.start), 'HH:mm');
                        let mLiveEndStr = format(parseISO(event.end), 'HH:mm');
                        if (isBeingResized) {
                          if (resizeEdge === 'top') {
                            mLiveTop = Math.min(resizeCurrentY, pos.top + pos.height - hourHeight / 4);
                            mLiveHeight = (pos.top + pos.height) - mLiveTop;
                          } else {
                            const newBottom = Math.max(resizeCurrentY, pos.top + hourHeight / 4);
                            mLiveHeight = newBottom - pos.top;
                          }
                          const tMin = Math.round((mLiveTop / hourHeight) * 60 / 15) * 15;
                          const tH = startHour + Math.floor(tMin / 60);
                          const tM = tMin % 60;
                          mLiveStartStr = `${String(tH).padStart(2, '0')}:${String(tM).padStart(2, '0')}`;
                          const bMin = Math.round(((mLiveTop + mLiveHeight) / hourHeight) * 60 / 15) * 15;
                          const bH = startHour + Math.floor(bMin / 60);
                          const bM = bMin % 60;
                          mLiveEndStr = `${String(bH).padStart(2, '0')}:${String(bM).padStart(2, '0')}`;
                        }

                        return (
                          <div key={item.id} data-event="true"
                            className={`absolute rounded px-1 text-xs overflow-hidden z-10 group border ${
                              isBeingMoved ? 'opacity-30 cursor-grabbing' : isBeingResized ? 'shadow-lg border-2 z-30' : 'cursor-grab'
                            }`}
                            style={{ top: `${mLiveTop}px`, height: `${Math.max(20, mLiveHeight)}px`, minHeight: '15px', left: `${leftPercent}%`, width: `${colWidth}%`, backgroundColor: `${color}15`, borderColor: isBeingResized ? color : `${color}60`, color }}
                            onMouseDown={e => { handleEventDragStart(event, e); handleEventMouseLeave(); }}
                            onTouchStart={e => handleEventTouchStart(event, e)}
                            onTouchEnd={handleEventTouchEnd}
                            onTouchMove={handleEventTouchMove}
                            onMouseEnter={e => handleEventMouseEnter(e, event, 'member', item.memberId)}
                            onMouseLeave={handleEventMouseLeave}>
                            <div className="absolute top-0 left-0 right-0 h-3 cursor-ns-resize z-30 rounded-t group/resize-top"
                              onMouseDown={e => handleResizeStart(event, 'top', e)}>
                              <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-6 h-1 rounded-full bg-blue-500/0 group-hover/resize-top:bg-blue-500/60 transition-colors" />
                            </div>
                            <div className="py-0.5 pointer-events-none select-none overflow-hidden h-full">
                              <div className="font-semibold leading-tight break-words overflow-hidden" style={{ fontSize: '11px', display: '-webkit-box', WebkitLineClamp: Math.max(1, Math.floor(Math.max(20, mLiveHeight) / 14)), WebkitBoxOrient: 'vertical' as const }}>{event.summary}</div>
                            </div>
                            <div className="absolute bottom-0 left-0 right-0 h-3 cursor-ns-resize z-30 rounded-b group/resize-bottom"
                              onMouseDown={e => handleResizeStart(event, 'bottom', e)}>
                              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-6 h-1 rounded-full bg-blue-500/0 group-hover/resize-bottom:bg-blue-500/60 transition-colors" />
                            </div>
                          </div>
                        );
                      }

                      return null;
                    })}

                    {/* Moving event ghost preview */}
                    {movingEvent && moveCurrentDay && isSameDay(moveCurrentDay, day) && (() => {
                      const eventDurationMs = new Date(movingEvent.end).getTime() - new Date(movingEvent.start).getTime();
                      const durationHours = eventDurationMs / (1000 * 60 * 60);
                      const ghostHeight = durationHours * hourHeight;
                      const totalMin = (moveCurrentY / hourHeight) * 60;
                      const snapMin = Math.round(totalMin / 15) * 15;
                      const h = startHour + Math.floor(snapMin / 60);
                      const m = snapMin % 60;
                      const timeStr = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
                      const endMin = snapMin + (eventDurationMs / (1000 * 60));
                      const eh = startHour + Math.floor(endMin / 60);
                      const em = Math.round(endMin % 60);
                      const endTimeStr = `${String(eh).padStart(2, '0')}:${String(em).padStart(2, '0')}`;
                      return (
                        <div className="absolute left-0.5 right-0.5 rounded px-1 py-0.5 text-xs z-40 pointer-events-none bg-blue-300 border-2 border-blue-500 text-blue-900 shadow-lg opacity-90"
                          style={{ top: `${moveCurrentY}px`, height: `${Math.max(15, ghostHeight)}px` }}>
                          <div className="font-medium truncate">{movingEvent.summary}</div>
                          <div className="opacity-75">{timeStr} - {endTimeStr}</div>
                        </div>
                      );
                    })()}

                    {/* Resize ghost removed - event box itself now resizes live */}

                    {/* Hold indicator - shows when user is holding to create */}
                    {holdIndicator && holdIndicator.dayStr === format(day, 'yyyy-MM-dd') && (
                      <div className="absolute z-40 pointer-events-none"
                        style={{ left: `${holdIndicator.x - 16}px`, top: `${holdIndicator.y - 16}px`, width: 32, height: 32 }}>
                        <div className="w-8 h-8 rounded-full bg-blue-400/30 border-2 border-blue-500 animate-ping" />
                        <div className="absolute inset-1 rounded-full bg-blue-500/50" />
                      </div>
                    )}

                    {/* Drag preview */}
                    {isDragging && dragStart && isSameDay(dragStart.day, day) && dragEnd && (() => {
                      const startY = Math.min(dragStart.y, dragEnd.y);
                      const endY = Math.max(dragStart.y, dragEnd.y);
                      const height = endY - startY;
                      if (height < 8) return null;
                      return (
                        <div className="absolute left-0.5 right-0.5 rounded bg-blue-200 border border-blue-400 border-dashed text-blue-800 px-1 text-xs z-30 pointer-events-none opacity-80 flex items-center"
                          style={{ top: `${startY}px`, height: `${height}px` }}>
                          <span className="font-medium">{yToTime(startY)} - {yToTime(endY)}</span>
                        </div>
                      );
                    })()}
                  </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ─── Hover Tooltip (1 second delay) ─── */}
      {!isMobile && hoverEvent && !selectedEvent && !selectedBooking && (() => {
        const { event, type, memberId, rect } = hoverEvent;
        const tooltipWidth = 280;
        const tooltipLeft = Math.min(rect.left + rect.width / 2 - tooltipWidth / 2, window.innerWidth - tooltipWidth - 16);
        const tooltipTop = rect.bottom + 8;
        const showAbove = tooltipTop + 200 > window.innerHeight;

        if (type === 'google' || type === 'member') {
          const ev = event as CalendarEvent;
          const memberName = memberId ? (teamMembers.find(m => m.id === memberId)?.name || teamMembers.find(m => m.id === memberId)?.email || '') : '';
          return (
            <div className="fixed z-[60] bg-white border border-gray-200 rounded-xl shadow-xl p-3 pointer-events-none"
              style={{ left: `${Math.max(8, tooltipLeft)}px`, top: showAbove ? undefined : `${tooltipTop}px`, bottom: showAbove ? `${window.innerHeight - rect.top + 8}px` : undefined, width: `${tooltipWidth}px` }}>
              {type === 'member' && memberName && (
                <div className="text-[10px] font-medium text-purple-600 uppercase tracking-wider mb-1">{memberName}</div>
              )}
              <div className="font-semibold text-gray-900 text-sm truncate">{ev.summary}</div>
              <div className="text-xs text-gray-600 mt-1">
                {format(parseISO(ev.start), 'M/d (E)', { locale: ja })} {format(parseISO(ev.start), 'HH:mm')} - {format(parseISO(ev.end), 'HH:mm')}
              </div>
              {ev.location && <div className="text-xs text-gray-500 mt-1 truncate">📍 {ev.location}</div>}
              {ev.meetLink && <div className="text-xs text-green-600 mt-1 pointer-events-auto"><a href={ev.meetLink} target="_blank" rel="noopener noreferrer" className="hover:underline">📹 Google Meet</a></div>}
              {ev.description && <div className="text-xs text-gray-500 mt-1.5 line-clamp-2 whitespace-pre-wrap">{ev.description.replace(/<[^>]*>/g, '')}</div>}
              {ev.attendees && ev.attendees.length > 0 && (
                <div className="text-xs text-gray-500 mt-1">👥 {ev.attendees.length}人の参加者</div>
              )}
            </div>
          );
        }

        if (type === 'booking') {
          const bk = event as Booking;
          return (
            <div className="fixed z-[60] bg-white border border-gray-200 rounded-xl shadow-xl p-3 pointer-events-none"
              style={{ left: `${Math.max(8, tooltipLeft)}px`, top: showAbove ? undefined : `${tooltipTop}px`, bottom: showAbove ? `${window.innerHeight - rect.top + 8}px` : undefined, width: `${tooltipWidth}px` }}>
              <div className="text-[10px] font-medium text-blue-600 uppercase tracking-wider mb-1">{getBookingTypeName(bk.event_type_id)}</div>
              <div className="font-semibold text-gray-900 text-sm">{bk.guest_name}</div>
              <div className="text-xs text-gray-600 mt-1">
                {format(parseISO(bk.start_time), 'M/d (E)', { locale: ja })} {format(parseISO(bk.start_time), 'HH:mm')} - {format(parseISO(bk.end_time), 'HH:mm')}
              </div>
              <div className="text-xs text-gray-500 mt-1">✉️ {bk.guest_email}</div>
              {bk.meeting_url && <div className="text-xs text-green-600 mt-1">📹 Google Meet</div>}
            </div>
          );
        }

        return null;
      })()}

      {/* ─── Google Event Detail / Edit Modal ─── */}
      {selectedEvent && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => { setSelectedEvent(null); setEditMode(false); }}>
          <div className="bg-white rounded-xl shadow-xl p-6 max-w-lg w-full mx-4" onClick={e => e.stopPropagation()}>
            {!editMode ? (
              /* ── Read Mode ── */
              <>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-gray-900">{selectedEvent.summary}</h3>
                  <div className="flex items-center gap-1">
                    <button onClick={() => handleEditStart(selectedEvent)} className="p-1.5 hover:bg-gray-100 rounded-lg" title="編集">
                      <Pencil className="w-4 h-4 text-gray-600" />
                    </button>
                    <button onClick={() => setShowDeleteConfirm(true)} className="p-1.5 hover:bg-red-50 rounded-lg" title="削除">
                      <Trash2 className="w-4 h-4 text-red-500" />
                    </button>
                    <button onClick={() => setSelectedEvent(null)} className="p-1.5 hover:bg-gray-100 rounded-lg">
                      <X className="w-5 h-5 text-gray-700" />
                    </button>
                  </div>
                </div>
                <div className="space-y-3">
                  <div className="text-sm text-gray-700">
                    <span className="font-medium">時間:</span>{' '}
                    {format(parseISO(selectedEvent.start), 'yyyy/MM/dd HH:mm')} - {format(parseISO(selectedEvent.end), 'HH:mm')}
                  </div>
                  {selectedEvent.description && (
                    <div className="text-sm text-gray-700">
                      <span className="font-medium">説明:</span>
                      <p className="mt-1 whitespace-pre-wrap text-gray-600">{selectedEvent.description.replace(/<[^>]*>/g, '')}</p>
                    </div>
                  )}
                  {selectedEvent.location && (
                    <div className="text-sm text-gray-700">
                      <MapPin className="w-3.5 h-3.5 inline mr-1" />
                      <span className="font-medium">場所:</span> {selectedEvent.location}
                    </div>
                  )}
                  {selectedEvent.meetLink && (
                    <div className="flex items-center gap-2 flex-wrap">
                      <a href={selectedEvent.meetLink} target="_blank" rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-sm bg-green-50 text-green-700 px-3 py-1.5 rounded-lg hover:bg-green-100 font-medium">
                        <Video className="w-4 h-4" /> Meet参加
                      </a>
                      <button
                        onClick={() => {
                          const startDt = parseISO(selectedEvent.start);
                          const endDt = parseISO(selectedEvent.end);
                          const dateStr = format(startDt, 'yyyy年M月d日(E)', { locale: ja });
                          const timeStr = `${format(startDt, 'HH:mm')}〜${format(endDt, 'HH:mm')}`;
                          const shareText = `${selectedEvent.summary}\n${dateStr} ${timeStr}\n${selectedEvent.meetLink}`;
                          if (navigator.share) {
                            navigator.share({ title: selectedEvent.summary, text: shareText });
                          } else {
                            navigator.clipboard.writeText(shareText);
                            alert('コピーしました');
                          }
                        }}
                        className="inline-flex items-center gap-1.5 text-sm bg-gray-50 text-gray-700 px-3 py-1.5 rounded-lg hover:bg-gray-100 font-medium border border-gray-200">
                        <Share2 className="w-4 h-4" /> 共有
                      </button>
                    </div>
                  )}
                  {selectedEvent.htmlLink && (
                    <a href={selectedEvent.htmlLink} target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-800">
                      <ExternalLink className="w-3.5 h-3.5" /> Googleカレンダーで開く
                    </a>
                  )}
                  {selectedEvent.attendees && selectedEvent.attendees.length > 0 && (
                    <div className="text-sm text-gray-700">
                      <span className="font-medium">参加者:</span>
                      <div className="mt-1 space-y-0.5">
                        {selectedEvent.attendees.map((a, i) => (
                          <div key={i} className="text-gray-600 text-xs bg-gray-50 rounded px-2 py-1">{a}</div>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div>
                      <div className="text-sm font-medium text-gray-900">予約の重複を許可</div>
                      <div className="text-xs text-gray-600">{selectedEvent.allowOverlap ? 'この予定の時間帯に予約可能' : 'この予定の時間帯は予約不可'}</div>
                    </div>
                    <button onClick={() => toggleOverlap(selectedEvent)}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${selectedEvent.allowOverlap ? 'bg-blue-600' : 'bg-gray-300'}`}>
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${selectedEvent.allowOverlap ? 'translate-x-6' : 'translate-x-1'}`} />
                    </button>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div>
                      <div className="text-sm font-medium text-gray-900">予定あり / 予定なし</div>
                      <div className="text-xs text-gray-600">{selectedEvent.transparency === 'transparent' ? '予定なし（予約可能エリア）' : '予定あり（予約不可）'}</div>
                    </div>
                    <button onClick={() => toggleTransparency(selectedEvent)}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${selectedEvent.transparency === 'transparent' ? 'bg-green-600' : 'bg-gray-300'}`}>
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${selectedEvent.transparency === 'transparent' ? 'translate-x-6' : 'translate-x-1'}`} />
                    </button>
                  </div>
                  {/* Meeting Notes */}
                  <MeetingNotes eventId={selectedEvent.id!} googleAttachments={selectedEvent.attachments} />
                  {/* Event Attachments */}
                  <EventAttachments eventId={selectedEvent.id!} />
                  <CommentSection targetType="google_event" targetId={selectedEvent.id!} currentUserId={currentUserId} />
                </div>

                {/* Delete Confirmation */}
                {showDeleteConfirm && (
                  <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                    <p className="text-sm text-red-700 mb-2">この予定を削除しますか？Googleカレンダーからも削除されます。</p>
                    <div className="flex gap-2">
                      <button onClick={() => setShowDeleteConfirm(false)}
                        className="flex-1 px-3 py-1.5 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50">キャンセル</button>
                      <button onClick={handleDeleteEvent} disabled={deletingEvent}
                        className="flex-1 px-3 py-1.5 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700 disabled:opacity-50">
                        {deletingEvent ? '削除中...' : '削除'}
                      </button>
                    </div>
                  </div>
                )}
              </>
            ) : (
              /* ── Edit Mode ── */
              (() => {
                const editTimeOpts = Array.from({ length: 96 }, (_, i) => {
                  const h = Math.floor(i / 4);
                  const m = (i % 4) * 15;
                  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
                });
                const fmtEditDate = (d: string) => { try { return format(parseISO(d), 'M月d日 (E)', { locale: ja }); } catch { return d; } };
                return (
              <>
                <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 -mx-6 -mt-6 mb-3">
                  <button onClick={() => setEditMode(false)} className="text-sm text-blue-600 font-medium">キャンセル</button>
                  <h3 className="text-sm font-semibold text-gray-900">予定を編集</h3>
                  <button onClick={handleSaveEdit} disabled={savingEvent || !editForm.summary}
                    className="text-sm text-blue-600 font-bold disabled:opacity-30">
                    {savingEvent ? '保存中...' : '保存'}
                  </button>
                </div>
                <div className="space-y-3">
                  {/* Title */}
                  <input type="text" value={editForm.summary}
                    onChange={e => setEditForm({ ...editForm, summary: e.target.value })}
                    placeholder="タイトルを追加"
                    className="w-full text-lg text-gray-900 placeholder-gray-400 border-b border-gray-200 pb-2 focus:outline-none focus:border-blue-500" />

                  {/* Description */}
                  <textarea value={editForm.description}
                    onChange={e => setEditForm({ ...editForm, description: e.target.value })}
                    rows={2} placeholder="説明を追加"
                    className="w-full text-sm text-gray-700 placeholder-gray-400 border-b border-gray-200 pb-2 focus:outline-none focus:border-blue-500" />

                  {/* Date/Time */}
                  <div className="border-b border-gray-100 pb-3">
                    <div className="flex items-center gap-3 mb-2">
                      <Clock className="w-5 h-5 text-gray-400 shrink-0" />
                      <span className="text-sm text-gray-500">日時</span>
                    </div>
                    {/* Start row */}
                    <div className="flex items-center gap-2 ml-8 mb-1.5">
                      <button onClick={() => {
                        const el = document.getElementById('edit-event-start-date');
                        if (el) (el as HTMLInputElement).showPicker();
                      }} className="text-sm text-gray-900 hover:bg-gray-50 px-2 py-1.5 rounded-lg flex-1 text-left">
                        {fmtEditDate(editForm.startDate)}
                      </button>
                      <input id="edit-event-start-date" type="date" value={editForm.startDate}
                        onChange={e => {
                          const nd = e.target.value;
                          setEditForm(f => ({ ...f, startDate: nd, endDate: f.endDate < nd ? nd : f.endDate }));
                        }}
                        className="sr-only" />
                      <select value={editForm.startTimeStr}
                        onChange={e => setEditForm({ ...editForm, startTimeStr: e.target.value })}
                        className="text-sm text-gray-900 bg-gray-50 border-0 rounded-lg px-2 py-1.5 w-20 text-right font-medium">
                        {editTimeOpts.map(t => <option key={`es-${t}`} value={t}>{t}</option>)}
                      </select>
                    </div>
                    {/* End row */}
                    <div className="flex items-center gap-2 ml-8">
                      <button onClick={() => {
                        const el = document.getElementById('edit-event-end-date');
                        if (el) (el as HTMLInputElement).showPicker();
                      }} className="text-sm text-gray-900 hover:bg-gray-50 px-2 py-1.5 rounded-lg flex-1 text-left">
                        {fmtEditDate(editForm.endDate)}
                      </button>
                      <input id="edit-event-end-date" type="date" value={editForm.endDate}
                        onChange={e => setEditForm({ ...editForm, endDate: e.target.value })}
                        className="sr-only" />
                      <select value={editForm.endTimeStr}
                        onChange={e => setEditForm({ ...editForm, endTimeStr: e.target.value })}
                        className="text-sm text-gray-900 bg-gray-50 border-0 rounded-lg px-2 py-1.5 w-20 text-right font-medium">
                        {editTimeOpts.map(t => <option key={`ee-${t}`} value={t}>{t}</option>)}
                      </select>
                    </div>
                  </div>

                  {/* Video / Location */}
                  <div className="flex items-center gap-3 border-b border-gray-100 pb-3">
                    <Video className="w-5 h-5 text-gray-400 shrink-0" />
                    <div className="flex gap-2 flex-1">
                      <button onClick={() => setEditForm({ ...editForm, locationType: 'online' })}
                        className={`flex-1 py-1.5 rounded-lg text-sm border ${editForm.locationType === 'online' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-500'}`}>
                        オンライン
                      </button>
                      <button onClick={() => setEditForm({ ...editForm, locationType: 'offline' })}
                        className={`flex-1 py-1.5 rounded-lg text-sm border ${editForm.locationType === 'offline' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-500'}`}>
                        オフライン
                      </button>
                    </div>
                  </div>
                  {editForm.locationType === 'offline' && (
                    <div className="flex items-center gap-3 border-b border-gray-100 pb-3">
                      <MapPin className="w-5 h-5 text-gray-400 shrink-0" />
                      <input type="text" value={editForm.location}
                        onChange={e => setEditForm({ ...editForm, location: e.target.value })}
                        placeholder="場所を追加"
                        className="flex-1 text-sm text-gray-700 focus:outline-none" />
                    </div>
                  )}
                </div>
              </>
                );
              })()
            )}
          </div>
        </div>
      )}

      {/* ─── Booking Detail Modal ─── */}
      {selectedBooking && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setSelectedBooking(null)}>
          <div className="bg-white rounded-xl shadow-xl p-6 max-w-md w-full mx-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">予約詳細</h3>
              <button onClick={() => setSelectedBooking(null)} className="p-1 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5 text-gray-700" />
              </button>
            </div>
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: getBookingColor(selectedBooking.event_type_id) }} />
                <span className="text-sm font-medium text-gray-900">{getBookingTypeName(selectedBooking.event_type_id)}</span>
              </div>
              <div className="text-sm text-gray-700"><span className="font-medium">ゲスト:</span> {selectedBooking.guest_name} ({selectedBooking.guest_email})</div>
              <div className="text-sm text-gray-700">
                <span className="font-medium">時間:</span>{' '}
                {format(parseISO(selectedBooking.start_time), 'yyyy/MM/dd HH:mm')} - {format(parseISO(selectedBooking.end_time), 'HH:mm')}
              </div>
              <div className="text-sm text-gray-700"><span className="font-medium">形式:</span> {selectedBooking.location_type === 'online' ? 'オンライン' : 'オフライン'}</div>
              {selectedBooking.meeting_url && (
                <a href={selectedBooking.meeting_url} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm bg-green-50 text-green-700 px-3 py-1.5 rounded-lg hover:bg-green-100 font-medium">
                  <Video className="w-4 h-4" /> Meet参加
                </a>
              )}
              <CommentSection targetType="booking" targetId={selectedBooking.id} currentUserId={currentUserId} />
            </div>
          </div>
        </div>
      )}

      {/* ─── New Event Form Modal ─── */}
      {showNewEventForm && (() => {
        const timeOpts = Array.from({ length: 96 }, (_, i) => {
          const h = Math.floor(i / 4);
          const m = (i % 4) * 15;
          return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
        });
        const reminderOpts = [
          { value: 1, label: '1分前' }, { value: 2, label: '2分前' }, { value: 3, label: '3分前' },
          { value: 5, label: '5分前' }, { value: 10, label: '10分前' }, { value: 15, label: '15分前' },
          { value: 20, label: '20分前' }, { value: 30, label: '30分前' },
        ];
        const fmtDate = (d: string) => { try { return format(parseISO(d), 'M月d日 (E)', { locale: ja }); } catch { return d; } };
        return (
        <div className="fixed inset-0 bg-black/50 flex items-start sm:items-center justify-center z-50 pt-12 sm:pt-0" onClick={() => setShowNewEventForm(false)}>
          <div className="bg-white rounded-2xl sm:rounded-xl shadow-xl w-[calc(100%-24px)] sm:max-w-md max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 sticky top-0 bg-white rounded-t-2xl z-10">
              <button onClick={() => setShowNewEventForm(false)} className="text-sm text-blue-600 font-medium">キャンセル</button>
              <button onClick={handleCreateEvent} disabled={!newEventForm.summary}
                className="text-sm text-blue-600 font-bold disabled:opacity-30">保存</button>
            </div>

            <div className="px-4 py-3 space-y-3">
              {/* Title */}
              <input type="text" value={newEventForm.summary}
                onChange={e => setNewEventForm({ ...newEventForm, summary: e.target.value })}
                placeholder="タイトルを追加"
                autoFocus
                className="w-full text-lg text-gray-900 placeholder-gray-400 border-b border-gray-200 pb-2 focus:outline-none focus:border-blue-500" />

              {/* Date/Time rows */}
              <div className="border-b border-gray-100 pb-3">
                <div className="flex items-center gap-3 mb-2">
                  <Clock className="w-5 h-5 text-gray-400 shrink-0" />
                  <span className="text-sm text-gray-500">日時</span>
                </div>
                {/* Start row */}
                <div className="flex items-center gap-2 ml-8 mb-1.5">
                  <button onClick={() => {
                    const el = document.getElementById('new-event-start-date');
                    if (el) (el as HTMLInputElement).showPicker();
                  }} className="text-sm text-gray-900 hover:bg-gray-50 px-2 py-1.5 rounded-lg flex-1 text-left">
                    {fmtDate(newEventForm.startDate)}
                  </button>
                  <input id="new-event-start-date" type="date" value={newEventForm.startDate}
                    onChange={e => {
                      const nd = e.target.value;
                      setNewEventForm(f => ({ ...f, startDate: nd, endDate: f.endDate < nd ? nd : f.endDate }));
                    }}
                    className="sr-only" />
                  <select value={newEventForm.startTimeStr}
                    onChange={e => setNewEventForm({ ...newEventForm, startTimeStr: e.target.value })}
                    className="text-sm text-gray-900 bg-gray-50 border-0 rounded-lg px-2 py-1.5 w-20 text-right font-medium">
                    {timeOpts.map(t => <option key={`s-${t}`} value={t}>{t}</option>)}
                  </select>
                </div>
                {/* End row */}
                <div className="flex items-center gap-2 ml-8">
                  <button onClick={() => {
                    const el = document.getElementById('new-event-end-date');
                    if (el) (el as HTMLInputElement).showPicker();
                  }} className="text-sm text-gray-900 hover:bg-gray-50 px-2 py-1.5 rounded-lg flex-1 text-left">
                    {fmtDate(newEventForm.endDate)}
                  </button>
                  <input id="new-event-end-date" type="date" value={newEventForm.endDate}
                    onChange={e => setNewEventForm({ ...newEventForm, endDate: e.target.value })}
                    className="sr-only" />
                  <select value={newEventForm.endTimeStr}
                    onChange={e => setNewEventForm({ ...newEventForm, endTimeStr: e.target.value })}
                    className="text-sm text-gray-900 bg-gray-50 border-0 rounded-lg px-2 py-1.5 w-20 text-right font-medium">
                    {timeOpts.map(t => <option key={`e-${t}`} value={t}>{t}</option>)}
                  </select>
                </div>
              </div>

              {/* Video / Location */}
              <div className="flex items-center gap-3 border-b border-gray-100 pb-3">
                <Video className="w-5 h-5 text-gray-400 shrink-0" />
                <div className="flex gap-2 flex-1">
                  <button onClick={() => setNewEventForm({ ...newEventForm, locationType: 'online' })}
                    className={`flex-1 py-1.5 rounded-lg text-sm border ${newEventForm.locationType === 'online' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-500'}`}>
                    オンライン
                  </button>
                  <button onClick={() => setNewEventForm({ ...newEventForm, locationType: 'offline' })}
                    className={`flex-1 py-1.5 rounded-lg text-sm border ${newEventForm.locationType === 'offline' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-500'}`}>
                    オフライン
                  </button>
                </div>
              </div>
              {newEventForm.locationType === 'offline' && (
                <div className="flex items-center gap-3 border-b border-gray-100 pb-3">
                  <MapPin className="w-5 h-5 text-gray-400 shrink-0" />
                  <input type="text" value={newEventForm.location}
                    onChange={e => setNewEventForm({ ...newEventForm, location: e.target.value })}
                    placeholder="場所を追加"
                    className="flex-1 text-sm text-gray-700 focus:outline-none" />
                </div>
              )}

              {/* Description */}
              <div className="flex items-start gap-3 border-b border-gray-100 pb-3">
                <Pencil className="w-5 h-5 text-gray-400 shrink-0 mt-0.5" />
                <textarea value={newEventForm.description}
                  onChange={e => setNewEventForm({ ...newEventForm, description: e.target.value })}
                  placeholder="説明を追加" rows={2}
                  className="flex-1 text-sm text-gray-700 focus:outline-none resize-none" />
              </div>

              {/* Reminder */}
              <div className="flex items-center gap-3 border-b border-gray-100 pb-3">
                <Bell className="w-5 h-5 text-gray-400 shrink-0" />
                <select value={newEventForm.reminderMinutes}
                  onChange={e => setNewEventForm({ ...newEventForm, reminderMinutes: Number(e.target.value) })}
                  className="text-sm text-gray-700 bg-transparent focus:outline-none">
                  {reminderOpts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>

              {/* Image attachments */}
              <div className="border-b border-gray-100 pb-3">
                <div className="flex items-center gap-3 mb-2">
                  <Image className="w-5 h-5 text-gray-400 shrink-0" />
                  <span className="text-sm text-gray-500">画像メモ</span>
                  <button onClick={() => newEventImageRef.current?.click()}
                    className="ml-auto text-xs text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1">
                    <Plus className="w-3.5 h-3.5" /> 追加
                  </button>
                  <input ref={newEventImageRef} type="file" accept="image/*" multiple className="hidden"
                    onChange={e => {
                      const files = e.target.files;
                      if (!files) return;
                      Array.from(files).forEach(file => {
                        const reader = new FileReader();
                        reader.onload = () => {
                          const result = reader.result as string;
                          const base64 = result.split(',')[1];
                          setNewEventImages(prev => [...prev, { base64, type: file.type || 'image/png' }]);
                        };
                        reader.readAsDataURL(file);
                      });
                      e.target.value = '';
                    }} />
                </div>
                {newEventImages.length > 0 && (
                  <div className="flex gap-2 ml-8 overflow-x-auto pb-1">
                    {newEventImages.map((img, i) => (
                      <div key={i} className="relative shrink-0">
                        <img src={`data:${img.type};base64,${img.base64}`}
                          alt={`添付画像 ${i + 1}`}
                          className="w-20 h-20 object-cover rounded-lg border border-gray-200" />
                        <button onClick={() => setNewEventImages(prev => prev.filter((_, j) => j !== i))}
                          className="absolute -top-1 -right-1 p-0.5 bg-black/60 text-white rounded-full">
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
        );
      })()}

      {/* ─── Override Modal ─── */}
      {showOverrideModal && selectedDay && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowOverrideModal(false)}>
          <div className="bg-white rounded-xl shadow-xl p-6 max-w-md w-full mx-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">{format(selectedDay, 'yyyy年M月d日', { locale: ja })}</h3>
              <button onClick={() => setShowOverrideModal(false)} className="p-1 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5 text-gray-700" />
              </button>
            </div>
            <div className="space-y-4">
              <div className="flex gap-2">
                <button onClick={() => setOverrideType('available')}
                  className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    overrideType === 'available' ? 'bg-green-100 text-green-700 border-2 border-green-500' : 'bg-gray-50 text-gray-600 border border-gray-200'
                  }`}>
                  <Plus className="w-4 h-4" /> 予約可能にする
                </button>
                <button onClick={() => setOverrideType('blocked')}
                  className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    overrideType === 'blocked' ? 'bg-red-100 text-red-700 border-2 border-red-500' : 'bg-gray-50 text-gray-600 border border-gray-200'
                  }`}>
                  <Ban className="w-4 h-4" /> 予約禁止にする
                </button>
              </div>
              {overrideType === 'available' && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">開始時間</label>
                    <input type="time" value={overrideStart} onChange={e => setOverrideStart(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-700" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">終了時間</label>
                    <input type="time" value={overrideEnd} onChange={e => setOverrideEnd(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-700" />
                  </div>
                </div>
              )}
              <button onClick={saveOverride}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors">
                <Check className="w-4 h-4" /> 保存
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Floating Action Buttons (bottom right) ─── */}
      <div className={`fixed ${isMobile ? 'bottom-20' : 'bottom-6'} right-4 z-40 flex flex-col items-end gap-3`}>
        {/* Schedule Match FAB */}
        <button
          onClick={() => { setShowScheduleMatch(true); resetScheduleMatch(); }}
          className="w-12 h-12 bg-white text-blue-600 rounded-full shadow-lg border border-gray-200 hover:bg-gray-50 transition-all flex items-center justify-center"
          title="予定調整"
        >
          <CalendarClock className="w-5 h-5" />
        </button>
        {/* New Event FAB */}
        <button
          onClick={() => {
            const now = new Date();
            const dateStr = format(now, 'yyyy-MM-dd');
            const hour = now.getHours();
            const nextHour = hour + 1;
            setNewEventForm({
              summary: '',
              description: '',
              startDate: dateStr, startTimeStr: `${String(hour).padStart(2, '0')}:00`,
              endDate: dateStr, endTimeStr: `${String(nextHour).padStart(2, '0')}:00`,
              locationType: 'online',
              location: '',
              reminderMinutes: 10,
            });
            setShowNewEventForm(true);
          }}
          className="w-14 h-14 bg-blue-600 text-white rounded-full shadow-lg hover:bg-blue-700 transition-all flex items-center justify-center"
          title="新規予定"
        >
          <Plus className="w-7 h-7" />
        </button>
      </div>

      {/* Hidden file inputs */}
      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileUpload} />
      <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFileUpload} />

      {/* ─── Schedule Match Modal ─── */}
      {showScheduleMatch && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50" onClick={() => setShowScheduleMatch(false)}>
          <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-xl w-full sm:max-w-lg max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="sticky top-0 bg-white border-b px-4 py-3 flex items-center justify-between rounded-t-2xl z-10">
              <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <CalendarClock className="w-5 h-5 text-blue-600" /> 予定調整
              </h3>
              <button onClick={() => setShowScheduleMatch(false)} className="p-1 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5 text-gray-700" />
              </button>
            </div>

            <div className="p-4">
              {scheduleMatchStep === 'input' && (
                <div className="space-y-4">
                  <p className="text-sm text-gray-600">
                    相手の予定や希望時間を入力すると、あなたの空き時間と照合して候補を出します。
                  </p>

                  {/* Input method buttons */}
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="flex items-center gap-2 px-4 py-3 bg-gray-50 hover:bg-gray-100 rounded-lg text-sm font-medium text-gray-700 transition-colors border border-gray-200"
                    >
                      <Image className="w-5 h-5 text-blue-500" /> 画像を選択
                    </button>
                    <button
                      onClick={() => cameraInputRef.current?.click()}
                      className="flex items-center gap-2 px-4 py-3 bg-gray-50 hover:bg-gray-100 rounded-lg text-sm font-medium text-gray-700 transition-colors border border-gray-200"
                    >
                      <Camera className="w-5 h-5 text-green-500" /> カメラで撮影
                    </button>
                  </div>

                  {/* Image preview */}
                  {scheduleMatchImage && (
                    <div className="relative">
                      <img
                        src={`data:${scheduleMatchImageType};base64,${scheduleMatchImage}`}
                        alt="アップロード画像"
                        className="w-full max-h-48 object-contain rounded-lg border border-gray-200"
                      />
                      <button
                        onClick={() => setScheduleMatchImage(null)}
                        className="absolute top-2 right-2 p-1 bg-black/50 text-white rounded-full hover:bg-black/70"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  )}

                  {/* Time filter */}
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1.5">時間帯フィルター</label>
                    <div className="grid grid-cols-4 gap-1.5">
                      {([
                        { value: 'all', label: '全て', sub: '9-23時' },
                        { value: 'morning', label: '午前', sub: '9-12時' },
                        { value: 'afternoon', label: '午後', sub: '13-18時' },
                        { value: 'evening', label: '夜', sub: '18-23時' },
                      ] as const).map(f => (
                        <button key={f.value}
                          onClick={() => setScheduleMatchTimeFilter(f.value)}
                          className={`px-2 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                            scheduleMatchTimeFilter === f.value
                              ? 'bg-blue-50 border-blue-300 text-blue-700'
                              : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'
                          }`}
                        >
                          <div>{f.label}</div>
                          <div className="text-[10px] opacity-70">{f.sub}</div>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Text input */}
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1 flex items-center gap-1">
                      <Type className="w-3.5 h-3.5" /> テキスト入力（コピペ）
                    </label>
                    <textarea
                      value={scheduleMatchInput}
                      onChange={e => setScheduleMatchInput(e.target.value)}
                      rows={4}
                      placeholder="相手のメッセージやメールをコピペしてください&#10;&#10;例: 来週の火曜か水曜の午前中でお願いします"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 resize-none"
                    />
                  </div>

                  {/* Submit */}
                  <button
                    onClick={() => handleScheduleMatchSubmit()}
                    disabled={!scheduleMatchInput && !scheduleMatchImage}
                    className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    <Clock className="w-4 h-4" /> 空き時間を照合
                  </button>
                </div>
              )}

              {scheduleMatchStep === 'loading' && (
                <div className="flex flex-col items-center justify-center py-12 gap-4">
                  <Loader2 className="w-10 h-10 text-blue-600 animate-spin" />
                  <p className="text-sm text-gray-600">カレンダーと照合中...</p>
                </div>
              )}

              {scheduleMatchStep === 'result' && scheduleMatchResult && (
                <div className="space-y-4">
                  {/* Analysis */}
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                    <p className="text-sm text-blue-900">{scheduleMatchResult.analysis}</p>
                  </div>

                  {/* Matching slots */}
                  <div>
                    <h4 className="text-sm font-medium text-gray-900 mb-2 flex items-center gap-1">
                      <Clock className="w-4 h-4 text-green-600" /> 候補時間（{scheduleMatchResult.slots.length}件）
                    </h4>
                    {scheduleMatchResult.slots.length > 0 ? (
                      <div className="space-y-1">
                        {scheduleMatchResult.slots.map((slot, i) => (
                          <button key={i}
                            onClick={() => {
                              // Build description from analysis + image reference
                              const descParts: string[] = [];
                              if (scheduleMatchResult.analysis) descParts.push(scheduleMatchResult.analysis);
                              if (scheduleMatchImage) descParts.push('[予定調整画像あり]');
                              const description = descParts.join('\n\n');

                              // Extract name from analysis for title
                              const nameMatch = scheduleMatchResult.analysis?.match(/(.+?)(?:さん|様|氏)/);
                              const title = nameMatch ? `${nameMatch[0]}とのミーティング` : 'ミーティング';

                              setNewEventForm({
                                summary: title,
                                description,
                                startDate: slot.date,
                                startTimeStr: slot.start,
                                endDate: slot.date,
                                endTimeStr: slot.end,
                                locationType: 'online',
                                location: '',
                                reminderMinutes: 10,
                              });
                              // Pass schedule match image to new event
                              if (scheduleMatchImage) {
                                setNewEventImages([{ base64: scheduleMatchImage, type: scheduleMatchImageType }]);
                              } else {
                                setNewEventImages([]);
                              }
                              setShowScheduleMatch(false);
                              setShowNewEventForm(true);
                            }}
                            className="w-full flex items-center gap-2 px-3 py-2 bg-green-50 border border-green-200 rounded-lg text-sm text-green-900 hover:bg-green-100 hover:border-green-300 transition-colors text-left"
                          >
                            <Check className="w-4 h-4 text-green-600 flex-shrink-0" />
                            <span className="flex-1">{slot.label}</span>
                            <Plus className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
                          </button>
                        ))}
                        <p className="text-[11px] text-gray-400 text-center mt-1">タップして予定に追加</p>
                      </div>
                    ) : (
                      <p className="text-sm text-gray-500 px-3 py-2">一致する空き時間が見つかりませんでした</p>
                    )}
                  </div>

                  {/* Suggested reply */}
                  {scheduleMatchResult.suggestedReply && (
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <h4 className="text-sm font-medium text-gray-900 flex items-center gap-1">
                          <Send className="w-4 h-4 text-blue-600" /> 返信文案
                        </h4>
                        <button
                          onClick={() => copyToClipboard(scheduleMatchResult!.suggestedReply)}
                          className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800"
                        >
                          <Copy className="w-3.5 h-3.5" /> コピー
                        </button>
                      </div>
                      <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-sm text-gray-800 whitespace-pre-wrap">
                        {scheduleMatchResult.suggestedReply}
                      </div>
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex gap-2">
                    <button
                      onClick={resetScheduleMatch}
                      className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200 transition-colors"
                    >
                      やり直す
                    </button>
                    <button
                      onClick={() => {
                        if (scheduleMatchResult?.suggestedReply) {
                          copyToClipboard(scheduleMatchResult.suggestedReply);
                        }
                        setShowScheduleMatch(false);
                      }}
                      className="flex-1 flex items-center justify-center gap-1 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
                    >
                      <Copy className="w-4 h-4" /> コピーして閉じる
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function CalendarPage() {
  return (
    <Suspense fallback={<div className="flex justify-center items-center h-64">読み込み中...</div>}>
      <CalendarPageContent />
    </Suspense>
  );
}
