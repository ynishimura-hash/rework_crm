'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import {
  format, startOfWeek, addDays, addWeeks, subWeeks,
  parseISO, isSameDay, addMinutes, parse,
  lastDayOfMonth, getDate, getDay, startOfMonth,
  eachDayOfInterval, addMonths, endOfMonth, startOfDay
} from 'date-fns';
import { ja } from 'date-fns/locale';
import ColorPicker from '@/components/ColorPicker';
import { getNextAvailableColor } from '@/lib/color-palette';
import {
  ChevronLeft, ChevronRight, Save, ArrowLeft,
  Video, MapPin, Check, Plus, X, Ban, Calendar, Repeat, RotateCcw, Wand2, Settings, Coffee, Mail
} from 'lucide-react';
import CommentSection from '@/components/CommentSection';
import { isWeekendOrHoliday } from '@/lib/japanese-holidays';

interface CalendarEvent {
  id: string;
  summary: string;
  start: string;
  end: string;
  allDay: boolean;
  allowOverlap: boolean;
  transparency?: 'opaque' | 'transparent';
  recurringEventId?: string | null;
  isOrganizer?: boolean;
}

interface LayoutEvent {
  id: string;
  start: string;
  end: string;
  source: 'google' | 'attendee';
  event: CalendarEvent;
  col: number;
  totalCols: number;
}

interface CustomSlot {
  date: string;
  startTime: string;
  endTime: string;
  isAllDay: boolean;
}

interface BlockedTime {
  date: string;
  startTime: string;
  endTime: string;
}

interface AvailabilityWindow {
  dayOfWeek: number;
  start: string;
  end: string;
}

type SchedulePatternType = 'none' | 'weekdays' | 'specific_days' | 'biweekly' | 'month_end' | 'specific_dates' | 'nth_weekday';

interface SchedulePattern {
  type: SchedulePatternType;
  // For 'weekdays' and 'specific_days': array of day numbers (0=Sun, 1=Mon, ..., 6=Sat)
  selectedDays: number[];
  // For 'biweekly': which weeks (1=odd weeks, 2=even weeks) + days
  biweeklyWeek: 1 | 2;
  biweeklyDays: number[];
  // For 'month_end': how many days before month end (0 = last day, 1 = second to last, etc.)
  monthEndDaysBefore: number;
  // For 'specific_dates': array of 'yyyy-MM-dd' strings
  specificDates: string[];
  // For 'nth_weekday': e.g., "every 2nd Tuesday" => nth=2, weekday=2
  nthWeek: number;
  nthWeekday: number;
  // Common: time range for auto-generated slots
  timeStart: string;
  timeEnd: string;
  // How many months ahead to generate
  monthsAhead: number;
}

const DEFAULT_PATTERN: SchedulePattern = {
  type: 'none',
  selectedDays: [1, 2, 3, 4, 5], // Mon-Fri
  biweeklyWeek: 1,
  biweeklyDays: [1, 2, 3, 4, 5],
  monthEndDaysBefore: 0,
  specificDates: [],
  nthWeek: 1,
  nthWeekday: 1,
  timeStart: '09:00',
  timeEnd: '17:00',
  monthsAhead: 2,
};

const DAY_LABELS = ['日', '月', '火', '水', '木', '金', '土'];

interface EventTypeFormData {
  name: string;
  slug: string;
  description: string;
  duration_minutes: number;
  location_type: 'online' | 'offline' | 'both';
  offline_location: string;
  buffer_before_minutes: number;
  buffer_after_minutes: number;
  color: string;
  email_template_id: string | null;
}

interface RegisteredUser {
  id: string;
  name: string;
  email: string;
  avatar_url: string | null;
}

interface BreakTime {
  startTime: string;
  endTime: string;
}

type DaySchedule = Record<string, Array<{start: string; end: string}>>;

interface EventTypeEditorProps {
  mode: 'create' | 'edit';
  eventTypeId?: string;
  initialForm?: EventTypeFormData;
  initialSlots?: CustomSlot[];
  initialBlockedTimes?: BlockedTime[];
  initialAttendeeIds?: string[];
  managedUserId?: string | null;
  initialBusinessHours?: { start: string; end: string };
  initialBreakTimes?: BreakTime[];
  initialDaySchedules?: DaySchedule;
  initialBookingStartOffsetDays?: number;
  initialBookingEndType?: string;
  initialBookingEndValue?: string;
}

const HOUR_HEIGHT = 48;
const START_HOUR = 6;
const END_HOUR = 23;
const TOTAL_HOURS = END_HOUR - START_HOUR;

// Feature flag: set to true to re-enable blocked times UI and drag mode toggle
const SHOW_BLOCKED_TIMES = false;

const DEFAULT_FORM: EventTypeFormData = {
  name: '',
  slug: '',
  description: '',
  duration_minutes: 30,
  location_type: 'online',
  offline_location: '',
  buffer_before_minutes: 0,
  buffer_after_minutes: 0,
  color: '#2563eb',
  email_template_id: null,
};

export default function EventTypeEditor({
  mode,
  eventTypeId,
  initialForm,
  initialSlots,
  initialBlockedTimes,
  initialAttendeeIds,
  managedUserId,
  initialBusinessHours,
  initialBreakTimes,
  initialDaySchedules,
  initialBookingStartOffsetDays,
  initialBookingEndType,
  initialBookingEndValue,
}: EventTypeEditorProps) {
  const router = useRouter();
  const supabase = createClient();

  const [form, setForm] = useState<EventTypeFormData>(initialForm || DEFAULT_FORM);
  const [registeredUsers, setRegisteredUsers] = useState<RegisteredUser[]>([]);
  const [selectedAttendeeIds, setSelectedAttendeeIds] = useState<string[]>(initialAttendeeIds || []);
  const [showAttendeeDropdown, setShowAttendeeDropdown] = useState(false);
  const attendeeDropdownRef = useRef<HTMLDivElement>(null);
  const [attendeeEvents, setAttendeeEvents] = useState<Record<string, CalendarEvent[]>>({});
  const [currentWeekStart, setCurrentWeekStart] = useState(() =>
    startOfWeek(new Date(), { weekStartsOn: 1 })
  );
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [availabilityWindows, setAvailabilityWindows] = useState<AvailabilityWindow[]>([]);
  const [customSlots, setCustomSlots] = useState<CustomSlot[]>(initialSlots || []);
  const [blockedTimes, setBlockedTimes] = useState<BlockedTime[]>(initialBlockedTimes || []);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | undefined>();
  const [allDayChecked, setAllDayChecked] = useState<Record<string, boolean>>({});
  const [freeScroll, setFreeScroll] = useState(false);
  const [viewDays, setViewDays] = useState<1 | 3 | 7 | 10 | 14>(7);
  const [hoveredEvent, setHoveredEvent] = useState<{ event: CalendarEvent; x: number; y: number } | null>(null);
  const hoverTimerRef = useRef<NodeJS.Timeout | null>(null);

  const handleCalEventMouseEnter = (e: React.MouseEvent, event: CalendarEvent) => {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    const x = e.clientX;
    const y = e.clientY;
    hoverTimerRef.current = setTimeout(() => {
      setHoveredEvent({ event, x, y });
    }, 1000);
  };

  const handleCalEventMouseLeave = () => {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    hoverTimerRef.current = null;
    setHoveredEvent(null);
  };

  const [emailTemplates, setEmailTemplates] = useState<{ id: string; name: string; is_default: boolean }[]>([]);
  const [showNewTemplateModal, setShowNewTemplateModal] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState('');
  const [newTemplateSubject, setNewTemplateSubject] = useState('{{eventTypeName}}のご予約確認');
  const [newTemplateBody, setNewTemplateBody] = useState('{{guestName}}様\n\nご予約ありがとうございます。\n\n日時: {{startTime}}\n所要時間: {{duration}}分\n\nよろしくお願いいたします。');
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [editMode, setEditMode] = useState(false);
  // Event drag state
  const [movingCalEvent, setMovingCalEvent] = useState<CalendarEvent | null>(null);
  const movingCalEventRef = useRef<CalendarEvent | null>(null);
  const [calEventMoveOffset, setCalEventMoveOffset] = useState(0);
  const [calEventMoveY, setCalEventMoveY] = useState(0);
  const calEventMoveYRef = useRef(0);
  // Event resize state
  const [resizingCalEvent, setResizingCalEvent] = useState<CalendarEvent | null>(null);
  const resizingCalEventRef = useRef<CalendarEvent | null>(null);
  const [resizeEdge, setResizeEdge] = useState<'top' | 'bottom'>('bottom');
  const resizeEdgeRef = useRef<'top' | 'bottom'>('bottom');
  const [resizeY, setResizeY] = useState(0);
  const resizeYRef = useRef(0);
  const calendarGridRef = useRef<HTMLDivElement>(null);
  const hasCalEventMovedRef = useRef(false);

  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<{ day: Date; y: number } | null>(null);
  const [dragEnd, setDragEnd] = useState<{ y: number } | null>(null);
  const [dragMode, setDragMode] = useState<'slot' | 'block'>('slot');
  const [movingSlot, setMovingSlot] = useState<CustomSlot | null>(null);
  const [moveOffset, setMoveOffset] = useState<number>(0);
  const hasMovedRef = useRef(false);
  const calendarRef = useRef<HTMLDivElement>(null);

  // Event cache for seamless horizontal scroll
  interface CacheEntry {
    events: CalendarEvent[];
    attendeeEvents: Record<string, CalendarEvent[]>;
    availabilityWindows: AvailabilityWindow[];
    rangeStart: string;
    rangeEnd: string;
    attendeeKey: string;
    fetchedAt: number;
  }
  const cacheRef = useRef<CacheEntry | null>(null);
  const prefetchingRef = useRef(false);
  const [initialLoad, setInitialLoad] = useState(true);

  // Track whether the name was auto-generated (update on duration change)
  const autoGeneratedNameRef = useRef<string | null>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  // Refs for horizontal wheel scroll
  const scrollDeltaRef = useRef(0);
  const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isDraggingRef = useRef(false);

  const [schedulePattern, setSchedulePattern] = useState<SchedulePattern>(DEFAULT_PATTERN);

  // Business hours & break times (default settings)
  const [businessHours, setBusinessHours] = useState(initialBusinessHours || { start: '09:00', end: '18:00' });
  const [breakTimes, setBreakTimes] = useState<BreakTime[]>(initialBreakTimes || [
    { startTime: '12:00', endTime: '13:00' },
  ]);
  const [breakForm, setBreakForm] = useState({ startTime: '12:00', endTime: '13:00' });

  // Blocked time form state (left panel)
  const [blockedForm, setBlockedForm] = useState({
    mode: 'single' as 'single' | 'batch',
    date: format(new Date(), 'yyyy-MM-dd'),
    period: 'this_month' as 'this_month' | 'next_month' | '1month' | '2months' | 'custom',
    dateFrom: format(new Date(), 'yyyy-MM-dd'),
    dateTo: format(addMonths(new Date(), 1), 'yyyy-MM-dd'),
    dayFilter: 'all' as 'all' | 'weekdays' | 'weekends_holidays' | 'specific_days',
    selectedDays: [1, 2, 3, 4, 5] as number[],
    startTime: '09:00',
    endTime: '10:00',
  });

  // Day schedule state
  const generateDefaultDaySchedules = useCallback((bh: { start: string; end: string }, bt: BreakTime[]): DaySchedule => {
    const schedule: DaySchedule = {};
    for (let d = 0; d < 7; d++) {
      if (d >= 1 && d <= 5) { // Mon-Fri
        if (bt.length === 0) {
          schedule[String(d)] = [{ start: bh.start, end: bh.end }];
        } else {
          // Split business hours by break times
          const ranges: Array<{ start: string; end: string }> = [];
          const sortedBreaks = [...bt].sort((a, b) => a.startTime.localeCompare(b.startTime));
          let currentStart = bh.start;
          for (const b of sortedBreaks) {
            if (b.startTime > currentStart && b.startTime < bh.end) {
              ranges.push({ start: currentStart, end: b.startTime });
            }
            if (b.endTime > currentStart) {
              currentStart = b.endTime;
            }
          }
          if (currentStart < bh.end) {
            ranges.push({ start: currentStart, end: bh.end });
          }
          schedule[String(d)] = ranges;
        }
      }
      // Weekend (0=Sun, 6=Sat) - no schedule by default
    }
    return schedule;
  }, []);

  const [daySchedules, setDaySchedules] = useState<DaySchedule>(() =>
    initialDaySchedules || generateDefaultDaySchedules(
      initialBusinessHours || { start: '09:00', end: '18:00' },
      initialBreakTimes || [
        { startTime: '12:00', endTime: '13:00' },
      ]
    )
  );
  const [showDayScheduleModal, setShowDayScheduleModal] = useState(false);
  const [tempDaySchedules, setTempDaySchedules] = useState<DaySchedule>({});
  // Store previous ranges when toggling off a day in the modal
  const dayScheduleBackupRef = useRef<Record<string, Array<{start: string; end: string}>>>({});

  // Booking period state
  const [bookingStartOffsetDays, setBookingStartOffsetDays] = useState<number>(initialBookingStartOffsetDays ?? 2);
  const [bookingEndType, setBookingEndType] = useState<'months' | 'specific_date'>((initialBookingEndType as 'months' | 'specific_date') || 'months');
  const [bookingEndValue, setBookingEndValue] = useState<string>(initialBookingEndValue || '3');
  const [bookingEndDate, setBookingEndDate] = useState<string>(
    initialBookingEndType === 'specific_date' && initialBookingEndValue ? initialBookingEndValue : format(addMonths(new Date(), 3), 'yyyy-MM-dd')
  );

  // Day schedule modal drag state
  const [dayScheduleDragging, setDayScheduleDragging] = useState(false);
  const [dayScheduleDragDay, setDayScheduleDragDay] = useState<number | null>(null);
  const [dayScheduleDragStartY, setDayScheduleDragStartY] = useState(0);
  const [dayScheduleDragEndY, setDayScheduleDragEndY] = useState(0);
  const dayScheduleGridRef = useRef<HTMLDivElement>(null);
  // Day schedule resize state
  const [dayScheduleResizing, setDayScheduleResizing] = useState(false);
  const [dayScheduleResizeDay, setDayScheduleResizeDay] = useState<number | null>(null);
  const [dayScheduleResizeIdx, setDayScheduleResizeIdx] = useState<number | null>(null);
  const [dayScheduleResizeEdge, setDayScheduleResizeEdge] = useState<'top' | 'bottom'>('bottom');
  const [dayScheduleResizeY, setDayScheduleResizeY] = useState(0);

  const weekDays = Array.from({ length: viewDays }, (_, i) => addDays(currentWeekStart, i));

  // Keep isDraggingRef in sync for wheel handler
  useEffect(() => { isDraggingRef.current = isDragging; }, [isDragging]);

  // Close attendee dropdown on click outside
  useEffect(() => {
    if (!showAttendeeDropdown) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (attendeeDropdownRef.current && !attendeeDropdownRef.current.contains(e.target as Node)) {
        setShowAttendeeDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showAttendeeDropdown]);

  // Fetch current user ID for comments
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setCurrentUserId(user.id);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fetch registered users and email templates in parallel on mount
  useEffect(() => {
    const templateUrl = managedUserId
      ? `/api/email-templates?type=confirmation&targetUserId=${managedUserId}`
      : '/api/email-templates?type=confirmation';
    Promise.all([
      fetch('/api/users').then(r => r.ok ? r.json() : null).catch(() => null),
      fetch(templateUrl).then(r => r.ok ? r.json() : null).catch(() => null),
    ]).then(([usersData, templatesData]) => {
      if (usersData?.users) setRegisteredUsers(usersData.users);
      if (templatesData?.templates) setEmailTemplates(templatesData.templates);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Generate default name and color on create mode
  useEffect(() => {
    if (mode !== 'create' || initialForm?.name) return;
    async function generateDefaults() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const targetUserId = managedUserId || user.id;
        const { data: existingTypes } = await supabase
          .from('scheduling_event_types')
          .select('name, color')
          .eq('user_id', targetUserId);
        const existingNames = new Set((existingTypes || []).map(t => t.name));
        const durationLabel = `${form.duration_minutes}分面談`;
        let counter = 1;
        let candidateName = `${durationLabel}${counter}`;
        while (existingNames.has(candidateName)) {
          counter++;
          candidateName = `${durationLabel}${counter}`;
        }
        autoGeneratedNameRef.current = candidateName;
        const usedColors = (existingTypes || []).map(t => t.color).filter(Boolean);
        const nextColor = getNextAvailableColor(usedColors);
        setForm(prev => ({ ...prev, name: candidateName, color: nextColor }));
      } catch (err) {
        console.error('Failed to generate defaults:', err);
      }
    }
    generateDefaults();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  // Fetch events for an arbitrary date range
  const fetchRange = useCallback(async (startDate: string, endDate: string) => {
    try {
      let url = `/api/calendar/events?startDate=${startDate}&endDate=${endDate}`;
      // When editing another user's event type, show their calendar
      if (managedUserId) {
        url += `&targetUserId=${managedUserId}`;
      }
      if (selectedAttendeeIds.length > 0) {
        url += `&attendeeIds=${selectedAttendeeIds.join(',')}`;
      }
      const res = await fetch(url);
      if (res.ok) {
        return (await res.json()) as {
          events: CalendarEvent[];
          availabilityWindows: AvailabilityWindow[];
          attendeeEvents: Record<string, CalendarEvent[]>;
        };
      }
      return null;
    } catch (err) {
      console.error('Failed to fetch events:', err);
      return null;
    }
  }, [selectedAttendeeIds, managedUserId]);

  // Fetch events with caching & background prefetch
  const fetchData = useCallback(async () => {
    const visibleStart = format(currentWeekStart, 'yyyy-MM-dd');
    const visibleEnd = format(addDays(currentWeekStart, viewDays), 'yyyy-MM-dd');
    const attendeeKey = [...selectedAttendeeIds].sort().join(',');

    // Cache hit: visible range within cached range & same attendees & fresh (120s TTL)
    if (cacheRef.current &&
        cacheRef.current.attendeeKey === attendeeKey &&
        cacheRef.current.rangeStart <= visibleStart &&
        cacheRef.current.rangeEnd >= visibleEnd &&
        Date.now() - cacheRef.current.fetchedAt < 120000) {
      setEvents(cacheRef.current.events);
      setAvailabilityWindows(cacheRef.current.availabilityWindows);
      setAttendeeEvents(cacheRef.current.attendeeEvents);
      setLoading(false);
      return;
    }

    // Cache miss: fetch visible 7 days (show loading only on initial load)
    if (initialLoad) setLoading(true);
    const data = await fetchRange(visibleStart, visibleEnd);
    if (data) {
      setEvents(data.events || []);
      setAvailabilityWindows(data.availabilityWindows || []);
      setAttendeeEvents(data.attendeeEvents || {});
      cacheRef.current = {
        events: data.events || [],
        attendeeEvents: data.attendeeEvents || {},
        availabilityWindows: data.availabilityWindows || [],
        rangeStart: visibleStart,
        rangeEnd: visibleEnd,
        attendeeKey,
        fetchedAt: Date.now(),
      };
    }
    setLoading(false);
    setInitialLoad(false);

    // Background prefetch wider range (±10 days)
    if (!prefetchingRef.current) {
      prefetchingRef.current = true;
      const prefetchStart = format(addDays(currentWeekStart, -10), 'yyyy-MM-dd');
      const prefetchEnd = format(addDays(currentWeekStart, viewDays + 10), 'yyyy-MM-dd');
      setTimeout(async () => {
        const wideData = await fetchRange(prefetchStart, prefetchEnd);
        if (wideData) {
          cacheRef.current = {
            events: wideData.events || [],
            attendeeEvents: wideData.attendeeEvents || {},
            availabilityWindows: wideData.availabilityWindows || [],
            rangeStart: prefetchStart,
            rangeEnd: prefetchEnd,
            attendeeKey,
            fetchedAt: Date.now(),
          };
          // Silently update state (no loading spinner)
          setEvents(wideData.events || []);
          setAvailabilityWindows(wideData.availabilityWindows || []);
          setAttendeeEvents(wideData.attendeeEvents || {});
        }
        prefetchingRef.current = false;
      }, 100);
    }
  }, [currentWeekStart, selectedAttendeeIds, fetchRange, initialLoad, viewDays]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Email templates now fetched in parallel with users on mount (see above)

  // Horizontal wheel scroll for freeScroll mode
  useEffect(() => {
    const container = calendarRef.current;
    if (!container || !freeScroll) return;

    const COLUMN_THRESHOLD = 80;

    const handleWheel = (e: WheelEvent) => {
      if (isDraggingRef.current) return;
      const deltaX = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : 0;
      if (deltaX === 0) return;

      e.preventDefault();
      scrollDeltaRef.current += deltaX;

      if (Math.abs(scrollDeltaRef.current) >= COLUMN_THRESHOLD) {
        const dayShift = scrollDeltaRef.current > 0 ? 1 : -1;
        setCurrentWeekStart(prev => addDays(prev, dayShift));
        scrollDeltaRef.current = 0;
      }

      if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
      scrollTimeoutRef.current = setTimeout(() => {
        scrollDeltaRef.current = 0;
      }, 150);
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      container.removeEventListener('wheel', handleWheel);
      if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
    };
  }, [freeScroll]);

  // Track whether initial auto-fill has been done
  const initialAutoFillDoneRef = useRef(false);

  // Compute all valid slots for given days (full replacement for those days)
  const computeSlotsForDays = useCallback((days: Date[], bh: { start: string; end: string }, bt: BreakTime[], evts: CalendarEvent[], attEvts: Record<string, CalendarEvent[]>, blkTimes: BlockedTime[]): CustomSlot[] => {
    const now = new Date();
    const slots: CustomSlot[] = [];

    for (const day of days) {
      const dateStr = format(day, 'yyyy-MM-dd');
      const dow = day.getDay();

      // Use day schedules: skip days with no schedule (e.g. weekends)
      const dayRanges = daySchedules[String(dow)];
      if (!dayRanges || dayRanges.length === 0) continue;

      const dayEvents = evts.filter(e => !e.allDay && !e.allowOverlap && isSameDay(parseISO(e.start), day));
      const dayAttEvents: CalendarEvent[] = [];
      for (const uid of Object.keys(attEvts)) {
        dayAttEvents.push(...(attEvts[uid] || []).filter(e => !e.allDay && isSameDay(parseISO(e.start), day)));
      }
      const allBlockingEvents = [...dayEvents, ...dayAttEvents];

      // Generate slots within each day schedule range
      for (const range of dayRanges) {
        // Clamp to business hours
        const rangeStart = range.start < bh.start ? bh.start : range.start;
        const rangeEnd = range.end > bh.end ? bh.end : range.end;
        if (rangeStart >= rangeEnd) continue;

        let current = parse(rangeStart, 'HH:mm', day);
        const dayEnd = parse(rangeEnd, 'HH:mm', day);

        while (current < dayEnd) {
          const slotEnd = addMinutes(current, 30);
          if (slotEnd > dayEnd) break;

          // Skip past slots
          if (slotEnd <= now) { current = addMinutes(current, 30); continue; }

          const slotStartStr = format(current, 'HH:mm');
          const slotEndStr = format(slotEnd, 'HH:mm');

          // Check conflicts with calendar events
          const hasConflict = allBlockingEvents.some(e => {
            const eStart = parseISO(e.start);
            const eEnd = parseISO(e.end);
            return current < eEnd && slotEnd > eStart;
          });

          // Check conflicts with blocked times
          const isBlocked = blkTimes.some(b => {
            if (b.date !== dateStr) return false;
            const bStart = parse(b.startTime, 'HH:mm', day);
            const bEnd = parse(b.endTime, 'HH:mm', day);
            return current < bEnd && slotEnd > bStart;
          });

          // Check conflicts with break times
          const isBreak = bt.some(btItem => {
            const bStart = parse(btItem.startTime, 'HH:mm', day);
            const bEnd = parse(btItem.endTime, 'HH:mm', day);
            return current < bEnd && slotEnd > bStart;
          });

          if (!hasConflict && !isBlocked && !isBreak) {
            slots.push({ date: dateStr, startTime: slotStartStr, endTime: slotEndStr, isAllDay: false });
          }
          current = addMinutes(current, 30);
        }
      }
    }
    return slots;
  }, [daySchedules]);

  // Regenerate slots for visible days (replace slots for those days, keep others; skip 全日NG days)
  const regenerateSlotsForVisibleDays = useCallback(() => {
    const visibleDateStrs = new Set(weekDays.map(d => format(d, 'yyyy-MM-dd')));
    // Skip days marked as 全日NG
    const activeDays = weekDays.filter(d => !allDayChecked[format(d, 'yyyy-MM-dd')]);
    const newSlots = computeSlotsForDays(activeDays, businessHours, breakTimes, events, attendeeEvents, blockedTimes);
    setCustomSlots(prev => {
      // Keep slots for non-visible days, replace visible days (clear NG days)
      const kept = prev.filter(s => !visibleDateStrs.has(s.date));
      return [...kept, ...newSlots];
    });
  }, [weekDays, businessHours, breakTimes, events, attendeeEvents, blockedTimes, computeSlotsForDays, allDayChecked]);

  // Generate slots for the full booking period (start offset to end date)
  const generateSlotsForFullPeriod = useCallback(() => {
    const today = new Date();
    const startDate = addDays(today, bookingStartOffsetDays);
    let endDate: Date;
    if (bookingEndType === 'specific_date') {
      endDate = parseISO(bookingEndDate);
    } else {
      endDate = addMonths(today, Number(bookingEndValue));
    }
    const allDays = eachDayOfInterval({ start: startDate, end: endDate });
    // For visible days, use full event data; for others, use empty events (no conflict data available)
    const visibleDateStrs = new Set(weekDays.map(d => format(d, 'yyyy-MM-dd')));
    const visibleDays = allDays.filter(d => visibleDateStrs.has(format(d, 'yyyy-MM-dd')));
    const nonVisibleDays = allDays.filter(d => !visibleDateStrs.has(format(d, 'yyyy-MM-dd')));

    const visibleSlots = computeSlotsForDays(visibleDays, businessHours, breakTimes, events, attendeeEvents, blockedTimes);
    const nonVisibleSlots = computeSlotsForDays(nonVisibleDays, businessHours, breakTimes, [], {}, blockedTimes);

    setCustomSlots([...visibleSlots, ...nonVisibleSlots]);
  }, [weekDays, businessHours, breakTimes, events, attendeeEvents, blockedTimes, computeSlotsForDays, bookingStartOffsetDays, bookingEndType, bookingEndValue, bookingEndDate]);

  // Auto-fill slots when events are first loaded, or when navigating to new weeks
  useEffect(() => {
    if (loading) return;
    // On first load (create mode): fill visible week only (fast initial render)
    if (!initialAutoFillDoneRef.current) {
      initialAutoFillDoneRef.current = true;
      if (mode === 'create') {
        regenerateSlotsForVisibleDays();
      }
      return;
    }
    // When navigating to new weeks: regenerate slots for visible days (with event data)
    regenerateSlotsForVisibleDays();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, currentWeekStart, events]);

  // Auto-regenerate slots when business hours, break times, day schedules, or attendees change
  const prevBusinessHoursRef = useRef(businessHours);
  const prevBreakTimesRef = useRef(breakTimes);
  const prevDaySchedulesRef = useRef(daySchedules);
  const prevAttendeeEventsRef = useRef(attendeeEvents);

  useEffect(() => {
    if (loading || !initialAutoFillDoneRef.current) return;
    const bhChanged = prevBusinessHoursRef.current.start !== businessHours.start || prevBusinessHoursRef.current.end !== businessHours.end;
    const btChanged = JSON.stringify(prevBreakTimesRef.current) !== JSON.stringify(breakTimes);
    const dsChanged = JSON.stringify(prevDaySchedulesRef.current) !== JSON.stringify(daySchedules);
    const attChanged = JSON.stringify(Object.keys(prevAttendeeEventsRef.current).sort()) !== JSON.stringify(Object.keys(attendeeEvents).sort());

    if (bhChanged || btChanged || dsChanged || attChanged) {
      prevBusinessHoursRef.current = businessHours;
      prevBreakTimesRef.current = breakTimes;
      prevDaySchedulesRef.current = daySchedules;
      prevAttendeeEventsRef.current = attendeeEvents;
      regenerateSlotsForVisibleDays();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessHours, breakTimes, daySchedules, attendeeEvents]);

  // --- Drag handlers ---
  const yToTime = (y: number): string => {
    const totalMinutes = Math.round((y / HOUR_HEIGHT) * 60 / 30) * 30;
    const hour = START_HOUR + Math.floor(totalMinutes / 60);
    const min = totalMinutes % 60;
    return `${String(Math.min(hour, END_HOUR)).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
  };

  const handleMouseDown = (day: Date, e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const dateStr = format(day, 'yyyy-MM-dd');
    hasMovedRef.current = false;

    // Check if clicking on an existing slot → enter move mode
    if (dragMode === 'slot') {
      const clickedSlot = customSlots.find(s => {
        if (s.date !== dateStr) return false;
        const pos = getSlotPosition(s.startTime, s.endTime);
        return y >= pos.top && y <= pos.top + pos.height;
      });
      if (clickedSlot) {
        e.preventDefault();
        const pos = getSlotPosition(clickedSlot.startTime, clickedSlot.endTime);
        setMovingSlot(clickedSlot);
        setMoveOffset(y - pos.top);
        setIsDragging(true);
        setDragStart({ day, y });
        setDragEnd({ y });
        return;
      }
    }

    setIsDragging(true);
    setDragStart({ day, y });
    setDragEnd({ y });
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDragging || !dragStart) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const y = Math.max(0, Math.min(e.clientY - rect.top, TOTAL_HOURS * HOUR_HEIGHT));
    if (Math.abs(y - dragStart.y) > 4) hasMovedRef.current = true;
    setDragEnd({ y });
  };

  const handleMouseUp = () => {
    if (!isDragging || !dragStart || !dragEnd) {
      setIsDragging(false);
      setMovingSlot(null);
      return;
    }

    // Handle move mode
    if (movingSlot && hasMovedRef.current) {
      const newY = dragEnd.y - moveOffset;
      const newStartTime = yToTime(Math.max(0, newY));

      // Preserve original duration
      const [osh, osm] = movingSlot.startTime.split(':').map(Number);
      const [oeh, oem] = movingSlot.endTime.split(':').map(Number);
      const durationMin = (oeh * 60 + oem) - (osh * 60 + osm);
      const [nsh, nsm] = newStartTime.split(':').map(Number);
      const newEndMinutes = nsh * 60 + nsm + durationMin;
      const newEndHour = Math.floor(newEndMinutes / 60);
      const newEndMin = newEndMinutes % 60;
      const newEndTime = `${String(newEndHour).padStart(2, '0')}:${String(newEndMin).padStart(2, '0')}`;

      const targetDateStr = format(dragStart.day, 'yyyy-MM-dd');
      const day = dragStart.day;

      // Check bounds and validity
      if (newEndHour <= END_HOUR && newStartTime < newEndTime) {
        const newStart = parse(newStartTime, 'HH:mm', day);
        const newEnd = parse(newEndTime, 'HH:mm', day);

        // Check overlap with other slots (excluding moving slot)
        const hasOverlap = customSlots.some(s => {
          if (s.date === movingSlot.date && s.startTime === movingSlot.startTime && s.endTime === movingSlot.endTime) return false;
          if (s.date !== targetDateStr) return false;
          const ss = parse(s.startTime, 'HH:mm', day);
          const se = parse(s.endTime, 'HH:mm', day);
          return newStart < se && newEnd > ss;
        });

        const isBlocked = blockedTimes.some(b => {
          if (b.date !== targetDateStr) return false;
          const bs = parse(b.startTime, 'HH:mm', day);
          const be = parse(b.endTime, 'HH:mm', day);
          return newStart < be && newEnd > bs;
        });

        if (!hasOverlap && !isBlocked) {
          setCustomSlots(prev => prev.map(s => {
            if (s.date === movingSlot.date && s.startTime === movingSlot.startTime && s.endTime === movingSlot.endTime) {
              return { ...s, date: targetDateStr, startTime: newStartTime, endTime: newEndTime };
            }
            return s;
          }));
        }
      }

      setMovingSlot(null);
      setMoveOffset(0);
      setIsDragging(false);
      setDragStart(null);
      setDragEnd(null);
      return;
    }

    // If clicking on a slot without moving, do nothing (let onClick handle removal)
    if (movingSlot && !hasMovedRef.current) {
      setMovingSlot(null);
      setMoveOffset(0);
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
      const day = dragStart.day;

      if (dragMode === 'block') {
        // Add as blocked time
        const exists = blockedTimes.some(
          b => b.date === dateStr && b.startTime === rangeStart && b.endTime === rangeEnd
        );
        if (!exists) {
          setBlockedTimes(prev => [...prev, { date: dateStr, startTime: rangeStart, endTime: rangeEnd }]);
          // Remove any custom slots that overlap with this blocked time
          const bStart = parse(rangeStart, 'HH:mm', day);
          const bEnd = parse(rangeEnd, 'HH:mm', day);
          setCustomSlots(prev => prev.filter(s => {
            if (s.date !== dateStr) return true;
            const sStart = parse(s.startTime, 'HH:mm', day);
            const sEnd = parse(s.endTime, 'HH:mm', day);
            return !(sStart < bEnd && sEnd > bStart);
          }));
        }
      } else {
        // Split into 30-minute slots
        const newSlots: CustomSlot[] = [];
        let current = parse(rangeStart, 'HH:mm', day);
        const end = parse(rangeEnd, 'HH:mm', day);

        const now = new Date();
        while (current < end) {
          const blockEnd = addMinutes(current, 30);
          if (blockEnd > end) break;

          // Skip past slots
          if (blockEnd <= now) { current = blockEnd; continue; }

          const slotStart = format(current, 'HH:mm');
          const slotEnd = format(blockEnd, 'HH:mm');

          const exists = customSlots.some(
            s => s.date === dateStr && s.startTime === slotStart && s.endTime === slotEnd
          );
          // Check not in blocked times
          const isBlocked = blockedTimes.some(b => {
            if (b.date !== dateStr) return false;
            const bs = parse(b.startTime, 'HH:mm', day);
            const be = parse(b.endTime, 'HH:mm', day);
            return current < be && blockEnd > bs;
          });
          // Check overlap with existing custom slots
          const overlapsExisting = customSlots.some(s => {
            if (s.date !== dateStr) return false;
            const ss = parse(s.startTime, 'HH:mm', day);
            const se = parse(s.endTime, 'HH:mm', day);
            return current < se && blockEnd > ss;
          });
          if (!exists && !isBlocked && !overlapsExisting) {
            newSlots.push({ date: dateStr, startTime: slotStart, endTime: slotEnd, isAllDay: false });
          }
          current = blockEnd;
        }
        if (newSlots.length > 0) {
          setCustomSlots(prev => [...prev, ...newSlots]);
        }
      }
    }

    setIsDragging(false);
    setDragStart(null);
    setDragEnd(null);
  };

  // --- Toggle transparency (busy/free) ---
  const toggleEventTransparency = async (event: CalendarEvent) => {
    const newTransparency = event.transparency === 'transparent' ? 'opaque' : 'transparent';
    // Optimistic update
    setEvents(prev => prev.map(e => e.id === event.id ? { ...e, transparency: newTransparency } : e));
    try {
      const res = await fetch('/api/calendar/events', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId: event.id, transparency: newTransparency }),
      });
      if (!res.ok) {
        setEvents(prev => prev.map(e => e.id === event.id ? { ...e, transparency: event.transparency } : e));
      } else if (event.recurringEventId) {
        // Propagate to all recurring instances
        setEvents(prev => prev.map(e =>
          e.recurringEventId === event.recurringEventId ? { ...e, transparency: newTransparency } : e
        ));
      }
    } catch (err) {
      setEvents(prev => prev.map(e => e.id === event.id ? { ...e, transparency: event.transparency } : e));
      console.error('Failed to toggle transparency:', err);
    }
  };

  // --- Edit mode: event drag-to-move ---
  const handleEventDragStart = (e: React.MouseEvent, event: CalendarEvent) => {
    e.preventDefault();
    const col = (e.currentTarget.parentElement as HTMLElement);
    const rect = col.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const pos = getEventPosition(event);
    setMovingCalEvent(event);
    movingCalEventRef.current = event;
    setCalEventMoveOffset(y - pos.top);
    setCalEventMoveY(y);
    calEventMoveYRef.current = y;
    hasCalEventMovedRef.current = false;
  };

  const handleEventMoveMouseMove = useCallback((e: MouseEvent) => {
    if (!movingCalEventRef.current || !calendarGridRef.current) return;
    const grid = calendarGridRef.current;
    const scrollParent = grid.closest('.overflow-auto') || grid.parentElement;
    const scrollTop = scrollParent ? scrollParent.scrollTop : 0;
    // Find the day column under the cursor
    const cols = grid.querySelectorAll('[data-daycolumn]');
    let targetCol: Element | null = null;
    for (const col of cols) {
      const r = col.getBoundingClientRect();
      if (e.clientX >= r.left && e.clientX <= r.right) {
        targetCol = col;
        break;
      }
    }
    if (!targetCol) return;
    const rect = targetCol.getBoundingClientRect();
    const y = e.clientY - rect.top;
    if (Math.abs(y - calEventMoveYRef.current) > 4) hasCalEventMovedRef.current = true;
    calEventMoveYRef.current = y;
    setCalEventMoveY(y);
  }, []);

  const handleEventMoveMouseUp = useCallback(async () => {
    const event = movingCalEventRef.current;
    if (!event || !hasCalEventMovedRef.current || !calendarGridRef.current) {
      setMovingCalEvent(null);
      movingCalEventRef.current = null;
      return;
    }

    // Calculate new time from Y position
    const rawY = calEventMoveYRef.current - calEventMoveOffset;
    const snappedY = Math.round(rawY / (HOUR_HEIGHT / 4)) * (HOUR_HEIGHT / 4); // 15-min snap
    const startHour = START_HOUR + snappedY / HOUR_HEIGHT;
    const durationMs = new Date(event.end).getTime() - new Date(event.start).getTime();
    const durationHours = durationMs / (1000 * 60 * 60);

    const origStart = parseISO(event.start);
    const newStart = new Date(origStart);
    newStart.setHours(Math.floor(startHour), Math.round((startHour % 1) * 60), 0, 0);
    const newEnd = new Date(newStart.getTime() + durationMs);

    // Bounds check
    if (newStart.getHours() + newStart.getMinutes() / 60 < START_HOUR ||
        newEnd.getHours() + newEnd.getMinutes() / 60 > END_HOUR) {
      setMovingCalEvent(null);
      movingCalEventRef.current = null;
      return;
    }

    const newStartISO = newStart.toISOString();
    const newEndISO = newEnd.toISOString();

    // Optimistic update
    const oldEvents = [...events];
    setEvents(prev => prev.map(e => e.id === event.id
      ? { ...e, start: newStartISO, end: newEndISO }
      : e
    ));

    setMovingCalEvent(null);
    movingCalEventRef.current = null;

    // Persist to Google Calendar
    try {
      const res = await fetch('/api/calendar/events', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId: event.id, startTime: newStartISO, endTime: newEndISO }),
      });
      if (!res.ok) throw new Error('Failed');
    } catch {
      // Rollback
      setEvents(oldEvents);
    }
  }, [calEventMoveOffset, events]);

  // --- Edit mode: event resize ---
  const handleResizeStart = (e: React.MouseEvent, event: CalendarEvent, edge: 'top' | 'bottom') => {
    e.preventDefault();
    e.stopPropagation();
    setResizingCalEvent(event);
    resizingCalEventRef.current = event;
    setResizeEdge(edge);
    resizeEdgeRef.current = edge;
    const col = (e.currentTarget.parentElement?.parentElement as HTMLElement);
    const rect = col.getBoundingClientRect();
    const y = e.clientY - rect.top;
    setResizeY(y);
    resizeYRef.current = y;
  };

  const handleResizeMouseMove = useCallback((e: MouseEvent) => {
    if (!resizingCalEventRef.current || !calendarGridRef.current) return;
    const cols = calendarGridRef.current.querySelectorAll('[data-daycolumn]');
    let targetCol: Element | null = null;
    for (const col of cols) {
      const r = col.getBoundingClientRect();
      if (e.clientX >= r.left && e.clientX <= r.right) {
        targetCol = col;
        break;
      }
    }
    if (!targetCol) return;
    const rect = targetCol.getBoundingClientRect();
    const y = e.clientY - rect.top;
    resizeYRef.current = y;
    setResizeY(y);
  }, []);

  const handleResizeMouseUp = useCallback(async () => {
    const event = resizingCalEventRef.current;
    const edge = resizeEdgeRef.current;
    if (!event) {
      setResizingCalEvent(null);
      resizingCalEventRef.current = null;
      return;
    }

    const snappedY = Math.round(resizeYRef.current / (HOUR_HEIGHT / 4)) * (HOUR_HEIGHT / 4);
    const timeAtY = START_HOUR + snappedY / HOUR_HEIGHT;
    const hours = Math.floor(timeAtY);
    const minutes = Math.round((timeAtY % 1) * 60);

    const origStart = parseISO(event.start);
    const origEnd = parseISO(event.end);
    let newStart = new Date(origStart);
    let newEnd = new Date(origEnd);

    if (edge === 'top') {
      newStart.setHours(hours, minutes, 0, 0);
      // Minimum 15 minutes
      if (newEnd.getTime() - newStart.getTime() < 15 * 60 * 1000) {
        newStart = new Date(newEnd.getTime() - 15 * 60 * 1000);
      }
    } else {
      newEnd.setHours(hours, minutes, 0, 0);
      if (newEnd.getTime() - newStart.getTime() < 15 * 60 * 1000) {
        newEnd = new Date(newStart.getTime() + 15 * 60 * 1000);
      }
    }

    // Bounds check
    if (newStart.getHours() + newStart.getMinutes() / 60 < START_HOUR ||
        newEnd.getHours() + newEnd.getMinutes() / 60 > END_HOUR) {
      setResizingCalEvent(null);
      resizingCalEventRef.current = null;
      return;
    }

    const newStartISO = newStart.toISOString();
    const newEndISO = newEnd.toISOString();

    // Optimistic update
    const oldEvents = [...events];
    setEvents(prev => prev.map(e => e.id === event.id
      ? { ...e, start: newStartISO, end: newEndISO }
      : e
    ));

    setResizingCalEvent(null);
    resizingCalEventRef.current = null;

    // Persist
    try {
      const res = await fetch('/api/calendar/events', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId: event.id, startTime: newStartISO, endTime: newEndISO }),
      });
      if (!res.ok) throw new Error('Failed');
    } catch {
      setEvents(oldEvents);
    }
  }, [events]);

  // Global mouse listeners for edit mode drag/resize
  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (movingCalEventRef.current) handleEventMoveMouseMove(e);
      if (resizingCalEventRef.current) handleResizeMouseMove(e);
    };
    const onMouseUp = () => {
      if (movingCalEventRef.current) handleEventMoveMouseUp();
      if (resizingCalEventRef.current) handleResizeMouseUp();
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [handleEventMoveMouseMove, handleEventMoveMouseUp, handleResizeMouseMove, handleResizeMouseUp]);

  // All-day toggle
  // Toggle "全日NG" - when checked, removes all slots for that day; when unchecked, regenerates slots
  const toggleAllDayNG = (day: Date) => {
    const dateStr = format(day, 'yyyy-MM-dd');
    const isCurrentlyBlocked = !!allDayChecked[dateStr];

    if (isCurrentlyBlocked) {
      // Unblock: regenerate slots for this day
      setAllDayChecked(prev => ({ ...prev, [dateStr]: false }));
      const newSlots = computeSlotsForDays([day], businessHours, breakTimes, events, attendeeEvents, blockedTimes);
      setCustomSlots(prev => [...prev, ...newSlots]);
    } else {
      // Block: remove all slots for this day
      setAllDayChecked(prev => ({ ...prev, [dateStr]: true }));
      setCustomSlots(prev => prev.filter(s => s.date !== dateStr));
    }
  };

  const removeSlot = (date: string, startTime: string, endTime: string) => {
    setCustomSlots(prev => prev.filter(
      s => !(s.date === date && s.startTime === startTime && s.endTime === endTime)
    ));
  };

  // Add blocked time from left panel form
  // Helper: add blocked entries for a list of dates and remove overlapping slots
  const addBlockedEntriesForDates = (dates: string[], startTime: string, endTime: string) => {
    const newEntries: BlockedTime[] = [];
    for (const dateStr of dates) {
      const exists = blockedTimes.some(
        b => b.date === dateStr && b.startTime === startTime && b.endTime === endTime
      );
      if (!exists && !newEntries.some(n => n.date === dateStr)) {
        newEntries.push({ date: dateStr, startTime, endTime });
      }
    }
    if (newEntries.length === 0) return 0;

    setBlockedTimes(prev => [...prev, ...newEntries]);

    // Remove overlapping custom slots
    const affectedDates = new Set(newEntries.map(e => e.date));
    setCustomSlots(prev => prev.filter(s => {
      if (!affectedDates.has(s.date)) return true;
      const day = parseISO(s.date);
      const sStart = parse(s.startTime, 'HH:mm', day);
      const sEnd = parse(s.endTime, 'HH:mm', day);
      const bStart = parse(startTime, 'HH:mm', day);
      const bEnd = parse(endTime, 'HH:mm', day);
      return !(sStart < bEnd && sEnd > bStart);
    }));
    return newEntries.length;
  };

  const addBlockedTime = () => {
    if (blockedForm.startTime >= blockedForm.endTime) {
      alert('終了時間は開始時間より後にしてください');
      return;
    }

    if (blockedForm.mode === 'batch') {
      addBatchBlockedTimes();
      return;
    }

    const count = addBlockedEntriesForDates([blockedForm.date], blockedForm.startTime, blockedForm.endTime);
    if (count === 0) return;
  };

  const addBatchBlockedTimes = () => {
    if (blockedForm.startTime >= blockedForm.endTime) {
      alert('終了時間は開始時間より後にしてください');
      return;
    }

    // Determine date range
    const today = startOfDay(new Date());
    let rangeStart: Date;
    let rangeEnd: Date;

    switch (blockedForm.period) {
      case 'this_month':
        rangeStart = today;
        rangeEnd = endOfMonth(today);
        break;
      case 'next_month': {
        const nextMonth = addMonths(today, 1);
        rangeStart = startOfMonth(nextMonth);
        rangeEnd = endOfMonth(nextMonth);
        break;
      }
      case '1month':
        rangeStart = today;
        rangeEnd = addMonths(today, 1);
        break;
      case '2months':
        rangeStart = today;
        rangeEnd = addMonths(today, 2);
        break;
      case 'custom':
        rangeStart = parseISO(blockedForm.dateFrom);
        rangeEnd = parseISO(blockedForm.dateTo);
        break;
      default:
        return;
    }

    if (rangeStart > rangeEnd) {
      alert('開始日が終了日より後です');
      return;
    }

    const allDates = eachDayOfInterval({ start: rangeStart, end: rangeEnd });

    // Filter by day filter
    const filteredDates = allDates.filter(d => {
      const dateStr = format(d, 'yyyy-MM-dd');
      const dow = getDay(d);
      switch (blockedForm.dayFilter) {
        case 'weekdays':
          return dow >= 1 && dow <= 5;
        case 'weekends_holidays':
          return isWeekendOrHoliday(d, dateStr);
        case 'specific_days':
          return blockedForm.selectedDays.includes(dow);
        case 'all':
        default:
          return true;
      }
    });

    const dateStrs = filteredDates.map(d => format(d, 'yyyy-MM-dd'));
    const count = addBlockedEntriesForDates(dateStrs, blockedForm.startTime, blockedForm.endTime);
    alert(`${count}件の予約不可時間を追加しました`);
  };

  const removeBlockedTime = (date: string, startTime: string, endTime: string) => {
    setBlockedTimes(prev => prev.filter(
      b => !(b.date === date && b.startTime === startTime && b.endTime === endTime)
    ));
  };

  // Remove all blocked times with the same time range (for batch removal)
  const removeBatchBlockedTimes = (startTime: string, endTime: string) => {
    const count = blockedTimes.filter(b => b.startTime === startTime && b.endTime === endTime).length;
    if (!confirm(`${startTime}-${endTime} の予約不可時間(${count}件)をすべて削除しますか？`)) return;
    setBlockedTimes(prev => prev.filter(b => !(b.startTime === startTime && b.endTime === endTime)));
  };

  // Break time management
  const addBreakTime = () => {
    if (breakForm.startTime >= breakForm.endTime) {
      alert('終了時間は開始時間より後にしてください');
      return;
    }
    const exists = breakTimes.some(
      b => b.startTime === breakForm.startTime && b.endTime === breakForm.endTime
    );
    if (exists) return;
    const newBreakTimes = [...breakTimes, { ...breakForm }];
    setBreakTimes(newBreakTimes);
    setDaySchedules(generateDefaultDaySchedules(businessHours, newBreakTimes));
  };

  const removeBreakTime = (startTime: string, endTime: string) => {
    const newBreakTimes = breakTimes.filter(b => !(b.startTime === startTime && b.endTime === endTime));
    setBreakTimes(newBreakTimes);
    setDaySchedules(generateDefaultDaySchedules(businessHours, newBreakTimes));
  };

  // Generate slots from schedule pattern
  const generateSlotsFromPattern = () => {
    if (schedulePattern.type === 'none') return;

    const today = new Date();
    const endDate = addMonths(today, schedulePattern.monthsAhead);
    const allDays = eachDayOfInterval({ start: today, end: endDate });
    const matchingDays: Date[] = [];

    for (const day of allDays) {
      const dow = getDay(day); // 0=Sun
      const dayOfMonth = getDate(day);
      const lastDay = getDate(lastDayOfMonth(day));

      switch (schedulePattern.type) {
        case 'weekdays':
        case 'specific_days':
          if (schedulePattern.selectedDays.includes(dow)) matchingDays.push(day);
          break;
        case 'biweekly': {
          // Get ISO week number to determine odd/even
          const startOfYear = new Date(day.getFullYear(), 0, 1);
          const weekNum = Math.ceil(((day.getTime() - startOfYear.getTime()) / 86400000 + startOfYear.getDay() + 1) / 7);
          const isMatchingWeek = schedulePattern.biweeklyWeek === 1 ? weekNum % 2 === 1 : weekNum % 2 === 0;
          if (isMatchingWeek && schedulePattern.biweeklyDays.includes(dow)) matchingDays.push(day);
          break;
        }
        case 'month_end':
          if (dayOfMonth === lastDay - schedulePattern.monthEndDaysBefore) matchingDays.push(day);
          break;
        case 'specific_dates':
          if (schedulePattern.specificDates.includes(format(day, 'yyyy-MM-dd'))) matchingDays.push(day);
          break;
        case 'nth_weekday': {
          // e.g., 2nd Tuesday: count how many times this weekday has appeared this month
          if (dow === schedulePattern.nthWeekday) {
            const monthStart = startOfMonth(day);
            const daysFromStart = eachDayOfInterval({ start: monthStart, end: day });
            const count = daysFromStart.filter(d => getDay(d) === dow).length;
            if (count === schedulePattern.nthWeek) matchingDays.push(day);
          }
          break;
        }
      }
    }

    // Generate 30-min slots for each matching day
    const newSlots: CustomSlot[] = [];
    for (const day of matchingDays) {
      const dateStr = format(day, 'yyyy-MM-dd');
      let current = parse(schedulePattern.timeStart, 'HH:mm', day);
      const end = parse(schedulePattern.timeEnd, 'HH:mm', day);

      while (current < end) {
        const blockEnd = addMinutes(current, 30);
        if (blockEnd > end) break;
        const slotStart = format(current, 'HH:mm');
        const slotEnd = format(blockEnd, 'HH:mm');

        // Skip if blocked
        const isBlocked = blockedTimes.some(b => {
          if (b.date !== dateStr) return false;
          const bs = parse(b.startTime, 'HH:mm', day);
          const be = parse(b.endTime, 'HH:mm', day);
          return current < be && blockEnd > bs;
        });

        // Skip if conflicting with calendar events
        const hasConflict = events.some(e => {
          if (e.allDay || e.allowOverlap) return false;
          if (!isSameDay(parseISO(e.start), day)) return false;
          return current < parseISO(e.end) && blockEnd > parseISO(e.start);
        });

        // Check overlap with existing custom slots
        const overlapsExisting = customSlots.some(s => {
          if (s.date !== dateStr) return false;
          const ss = parse(s.startTime, 'HH:mm', day);
          const se = parse(s.endTime, 'HH:mm', day);
          return current < se && blockEnd > ss;
        });

        // Check conflicts with break times
        const isBreak = isInBreakTime(current, blockEnd, day);

        if (!isBlocked && !hasConflict && !overlapsExisting && !isBreak) {
          newSlots.push({ date: dateStr, startTime: slotStart, endTime: slotEnd, isAllDay: false });
        }
        current = blockEnd;
      }
    }

    if (newSlots.length > 0) {
      setCustomSlots(prev => [...prev, ...newSlots]);
    }
    alert(`${matchingDays.length}日分、${newSlots.length}スロットを追加しました`);
  };

  // Reset all slots
  const resetAllSlots = () => {
    if (customSlots.length === 0) return;
    if (!confirm('すべての予約可能スロットをリセットしますか？')) return;
    setCustomSlots([]);
    setAllDayChecked({});
  };

  // Helper: check if a time range overlaps with any break time
  const isInBreakTime = (current: Date, slotEnd: Date, day: Date): boolean => {
    return breakTimes.some(bt => {
      const bStart = parse(bt.startTime, 'HH:mm', day);
      const bEnd = parse(bt.endTime, 'HH:mm', day);
      return current < bEnd && slotEnd > bStart;
    });
  };

  // Helper: check if a time slot is in the past
  const isPastSlot = (day: Date, endTime: string): boolean => {
    const now = new Date();
    const slotEnd = parse(endTime, 'HH:mm', day);
    return slotEnd <= now;
  };

  // Count available empty 30-min slots across visible days (using daySchedules, excluding past, events, breaks, existing slots)
  const emptySlotCount = useMemo(() => {
    const now = new Date();
    let count = 0;

    for (const day of weekDays) {
      const dateStr = format(day, 'yyyy-MM-dd');
      const dow = day.getDay();

      // Use day schedules: skip days with no schedule (e.g. weekends)
      const dayRanges = daySchedules[String(dow)];
      if (!dayRanges || dayRanges.length === 0) continue;

      const dayEvents = events.filter(e => !e.allDay && !e.allowOverlap && isSameDay(parseISO(e.start), day));
      const dayAttEvents: CalendarEvent[] = [];
      for (const uid of Object.keys(attendeeEvents)) {
        dayAttEvents.push(...(attendeeEvents[uid] || []).filter(e => !e.allDay && isSameDay(parseISO(e.start), day)));
      }
      const allBlockingEvents = [...dayEvents, ...dayAttEvents];

      for (const range of dayRanges) {
        // Clamp to business hours
        const rangeStart = range.start < businessHours.start ? businessHours.start : range.start;
        const rangeEnd = range.end > businessHours.end ? businessHours.end : range.end;
        if (rangeStart >= rangeEnd) continue;

        let current = parse(rangeStart, 'HH:mm', day);
        const dayEnd = parse(rangeEnd, 'HH:mm', day);

        while (current < dayEnd) {
          const slotEnd = addMinutes(current, 30);
          if (slotEnd > dayEnd) break;

          // Skip past slots
          if (slotEnd <= now) { current = addMinutes(current, 30); continue; }

          const hasConflict = allBlockingEvents.some(e => {
            const eStart = parseISO(e.start);
            const eEnd = parseISO(e.end);
            return current < eEnd && slotEnd > eStart;
          });
          const isBreak = isInBreakTime(current, slotEnd, day);
          const overlapsExisting = customSlots.some(s => {
            if (s.date !== dateStr) return false;
            const ss = parse(s.startTime, 'HH:mm', day);
            const se = parse(s.endTime, 'HH:mm', day);
            return current < se && slotEnd > ss;
          });

          if (!hasConflict && !isBreak && !overlapsExisting) {
            count++;
          }
          current = addMinutes(current, 30);
        }
      }
    }
    return count;
  }, [weekDays, events, attendeeEvents, customSlots, businessHours, breakTimes, daySchedules]);

  // Auto-populate slots in empty calendar spaces (current week) - manual button
  const autoPopulateEmptySpaces = () => {
    regenerateSlotsForVisibleDays();
  };

  // Day schedule modal helpers
  const DAY_SCHEDULE_START_HOUR = 6;
  const DAY_SCHEDULE_END_HOUR = 23;
  const DAY_SCHEDULE_HOURS = DAY_SCHEDULE_END_HOUR - DAY_SCHEDULE_START_HOUR;
  const DAY_SCHEDULE_ROW_HEIGHT = 24; // px per 30 min

  const dayScheduleYToTime = (y: number): string => {
    const totalMinutes = Math.round((y / DAY_SCHEDULE_ROW_HEIGHT) * 30 / 30) * 30;
    const hour = DAY_SCHEDULE_START_HOUR + Math.floor(totalMinutes / 30 / 2);
    const min = (Math.floor(totalMinutes / 30) % 2) * 30;
    return `${String(Math.min(Math.max(hour, DAY_SCHEDULE_START_HOUR), DAY_SCHEDULE_END_HOUR)).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
  };

  const handleDayScheduleDragStart = (dayIdx: number, e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top;
    setDayScheduleDragging(true);
    setDayScheduleDragDay(dayIdx);
    setDayScheduleDragStartY(y);
    setDayScheduleDragEndY(y);
  };

  const handleDayScheduleDragMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!dayScheduleDragging) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const y = Math.max(0, Math.min(e.clientY - rect.top, DAY_SCHEDULE_HOURS * 2 * DAY_SCHEDULE_ROW_HEIGHT));
    setDayScheduleDragEndY(y);
  };

  const handleDayScheduleDragEnd = () => {
    if (!dayScheduleDragging || dayScheduleDragDay === null) {
      setDayScheduleDragging(false);
      return;
    }
    const startY = Math.min(dayScheduleDragStartY, dayScheduleDragEndY);
    const endY = Math.max(dayScheduleDragStartY, dayScheduleDragEndY);
    if (endY - startY < DAY_SCHEDULE_ROW_HEIGHT / 2) {
      setDayScheduleDragging(false);
      return;
    }
    const startTime = dayScheduleYToTime(startY);
    const endTime = dayScheduleYToTime(endY);
    if (startTime >= endTime) {
      setDayScheduleDragging(false);
      return;
    }
    const dayKey = String(dayScheduleDragDay);
    setTempDaySchedules(prev => {
      const existing = prev[dayKey] || [];
      // Merge overlapping ranges
      const newRange = { start: startTime, end: endTime };
      const merged = [...existing, newRange].sort((a, b) => a.start.localeCompare(b.start));
      const result: Array<{ start: string; end: string }> = [];
      for (const r of merged) {
        if (result.length === 0 || result[result.length - 1].end < r.start) {
          result.push({ ...r });
        } else {
          result[result.length - 1].end = r.end > result[result.length - 1].end ? r.end : result[result.length - 1].end;
        }
      }
      return { ...prev, [dayKey]: result };
    });
    setDayScheduleDragging(false);
  };

  const removeDayScheduleRange = (dayIdx: number, rangeIdx: number) => {
    const dayKey = String(dayIdx);
    setTempDaySchedules(prev => {
      const existing = [...(prev[dayKey] || [])];
      existing.splice(rangeIdx, 1);
      const updated = { ...prev };
      if (existing.length === 0) {
        delete updated[dayKey];
      } else {
        updated[dayKey] = existing;
      }
      return updated;
    });
  };

  // Day schedule range resize handlers
  const handleDayScheduleResizeStart = (dayIdx: number, rangeIdx: number, edge: 'top' | 'bottom', e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDayScheduleResizing(true);
    setDayScheduleResizeDay(dayIdx);
    setDayScheduleResizeIdx(rangeIdx);
    setDayScheduleResizeEdge(edge);
    const col = (e.currentTarget as HTMLElement).closest('[data-daycol]') || (e.target as HTMLElement).closest('[data-daycol]');
    if (col) {
      const rect = col.getBoundingClientRect();
      setDayScheduleResizeY(e.clientY - rect.top);
    }
  };

  const handleDayScheduleResizeMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!dayScheduleResizing) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const y = Math.max(0, Math.min(e.clientY - rect.top, DAY_SCHEDULE_HOURS * 2 * DAY_SCHEDULE_ROW_HEIGHT));
    setDayScheduleResizeY(y);
  };

  const handleDayScheduleResizeEnd = () => {
    if (!dayScheduleResizing || dayScheduleResizeDay === null || dayScheduleResizeIdx === null) {
      setDayScheduleResizing(false);
      return;
    }
    const dayKey = String(dayScheduleResizeDay);
    const snappedY = Math.round(dayScheduleResizeY / DAY_SCHEDULE_ROW_HEIGHT) * DAY_SCHEDULE_ROW_HEIGHT;
    const newTime = dayScheduleYToTime(snappedY);

    setTempDaySchedules(prev => {
      const existing = [...(prev[dayKey] || [])];
      const range = existing[dayScheduleResizeIdx!];
      if (!range) return prev;
      const updated = { ...range };
      if (dayScheduleResizeEdge === 'top') {
        if (newTime < updated.end) updated.start = newTime;
      } else {
        if (newTime > updated.start) updated.end = newTime;
      }
      // Ensure minimum 30 min
      const [sh, sm] = updated.start.split(':').map(Number);
      const [eh, em] = updated.end.split(':').map(Number);
      if ((eh * 60 + em) - (sh * 60 + sm) < 30) {
        setDayScheduleResizing(false);
        return prev;
      }
      existing[dayScheduleResizeIdx!] = updated;
      return { ...prev, [dayKey]: existing };
    });
    setDayScheduleResizing(false);
  };

  const openDayScheduleModal = () => {
    setTempDaySchedules({ ...daySchedules });
    setShowDayScheduleModal(true);
  };

  const confirmDaySchedule = () => {
    setDaySchedules({ ...tempDaySchedules });
    setShowDayScheduleModal(false);
  };

  // Toggle a day on/off in the day schedule modal
  const toggleDayInModal = (dayIdx: number) => {
    const dayKey = String(dayIdx);
    setTempDaySchedules(prev => {
      const existing = prev[dayKey] || [];
      if (existing.length > 0) {
        // Turn OFF: backup current ranges, then remove
        dayScheduleBackupRef.current[dayKey] = [...existing];
        const updated = { ...prev };
        delete updated[dayKey];
        return updated;
      } else {
        // Turn ON: restore backup, or generate default from business hours minus breaks
        const backup = dayScheduleBackupRef.current[dayKey];
        if (backup && backup.length > 0) {
          return { ...prev, [dayKey]: [...backup] };
        }
        // Generate default ranges: business hours split by break times
        const defaultRanges: Array<{start: string; end: string}> = [];
        let currentStart = businessHours.start;
        const sortedBreaks = [...breakTimes].sort((a, b) => a.startTime.localeCompare(b.startTime));
        for (const bt of sortedBreaks) {
          if (bt.startTime > currentStart && bt.startTime < businessHours.end) {
            defaultRanges.push({ start: currentStart, end: bt.startTime });
          }
          if (bt.endTime > currentStart) {
            currentStart = bt.endTime;
          }
        }
        if (currentStart < businessHours.end) {
          defaultRanges.push({ start: currentStart, end: businessHours.end });
        }
        return { ...prev, [dayKey]: defaultRanges.length > 0 ? defaultRanges : [{ start: businessHours.start, end: businessHours.end }] };
      }
    });
  };

  // Get compact display for a day's schedule
  const getDayScheduleDisplay = (dayIdx: number): string => {
    const ranges = daySchedules[String(dayIdx)];
    if (!ranges || ranges.length === 0) return '';
    if (ranges.length === 1) {
      return `${ranges[0].start.replace(':00', '').replace(':30', ':30')}-${ranges[0].end.replace(':00', '').replace(':30', ':30')}`;
    }
    const first = ranges[0];
    const shortFirst = `${first.start.replace(':00', '').replace(':30', ':30')}-${first.end.replace(':00', '').replace(':30', ':30')}`;
    return `${shortFirst}他`;
  };

  // Save new email template
  const handleSaveNewTemplate = async () => {
    if (!newTemplateName.trim()) return;
    setSavingTemplate(true);
    try {
      const res = await fetch('/api/email-templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newTemplateName,
          subject: newTemplateSubject,
          body_html: newTemplateBody,
          type: 'confirmation',
          is_default: false,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const tmpl = data.template || data;
        setEmailTemplates(prev => [...prev, { id: tmpl.id, name: newTemplateName, is_default: false }]);
        setForm({ ...form, email_template_id: tmpl.id });
        setShowNewTemplateModal(false);
        setNewTemplateName('');
      }
    } catch (err) { console.error('Failed to save template:', err); }
    finally { setSavingTemplate(false); }
  };

  // Save handler - uses API route to bypass RLS for cross-user editing
  const handleSave = async () => {
    if (!form.name) return alert('名前を入力してください');
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const slug = form.slug || form.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

      const payload = {
        user_id: managedUserId || user.id,
        name: form.name,
        slug,
        description: form.description,
        duration_minutes: form.duration_minutes,
        location_type: form.location_type,
        offline_location: form.offline_location,
        buffer_before_minutes: form.buffer_before_minutes,
        buffer_after_minutes: form.buffer_after_minutes,
        color: form.color,
        is_active: true,
        use_custom_slots: true,
        business_hours_start: businessHours.start,
        business_hours_end: businessHours.end,
        break_times: breakTimes.map(bt => ({ start_time: bt.startTime, end_time: bt.endTime })),
        email_template_id: form.email_template_id,
        day_schedules: daySchedules,
        booking_start_offset_days: bookingStartOffsetDays,
        booking_end_type: bookingEndType,
        booking_end_value: bookingEndType === 'specific_date' ? bookingEndDate : bookingEndValue,
      };

      // Generate full period slots
      const today = new Date();
      const periodStart = addDays(today, bookingStartOffsetDays);
      let periodEnd: Date;
      if (bookingEndType === 'specific_date') {
        periodEnd = parseISO(bookingEndDate);
      } else {
        periodEnd = addMonths(today, Number(bookingEndValue));
      }
      const allPeriodDays = eachDayOfInterval({ start: periodStart, end: periodEnd });
      const existingSlotDates = new Set(customSlots.map(s => s.date));
      const unvisitedDays = allPeriodDays.filter(d => {
        const dateStr = format(d, 'yyyy-MM-dd');
        return !existingSlotDates.has(dateStr) && !allDayChecked[dateStr];
      });
      const autoSlots = computeSlotsForDays(unvisitedDays, businessHours, breakTimes, [], {}, blockedTimes);
      const allSlots = [...customSlots, ...autoSlots];

      // Save via API (service role, bypasses RLS)
      const res = await fetch('/api/event-types', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode,
          eventTypeId,
          payload,
          slots: allSlots,
          blockedTimes,
          attendeeIds: selectedAttendeeIds,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        console.error('Save failed:', errData);
        alert('保存に失敗しました');
        return;
      }

      router.push('/event-types');
    } catch (err) {
      console.error('Save error:', err);
      alert('保存中にエラーが発生しました');
    } finally {
      setSaving(false);
    }
  };

  // --- Rendering helpers ---
  const getEventPosition = (event: CalendarEvent) => {
    const start = parseISO(event.start);
    const end = parseISO(event.end);
    const startHour = start.getHours() + start.getMinutes() / 60;
    const endHour = end.getHours() + end.getMinutes() / 60;
    const top = (startHour - START_HOUR) * HOUR_HEIGHT;
    const height = (endHour - startHour) * HOUR_HEIGHT;
    return { top: Math.max(0, top), height: Math.max(8, height) };
  };

  const getSlotPosition = (startTime: string, endTime: string) => {
    const [sh, sm] = startTime.split(':').map(Number);
    const [eh, em] = endTime.split(':').map(Number);
    const startHour = sh + sm / 60;
    const endHour = eh + em / 60;
    const top = (startHour - START_HOUR) * HOUR_HEIGHT;
    const height = (endHour - startHour) * HOUR_HEIGHT;
    return { top: Math.max(0, top), height: Math.max(8, height) };
  };

  const getDayEvents = (day: Date) =>
    events.filter(e => !e.allDay && isSameDay(parseISO(e.start), day));

  const getDaySlots = (day: Date) =>
    customSlots.filter(s => s.date === format(day, 'yyyy-MM-dd'));

  const getDayBlockedTimes = (day: Date) =>
    blockedTimes.filter(b => b.date === format(day, 'yyyy-MM-dd'));

  const getDayAttendeeEvents = (day: Date) => {
    const allAttEvents: CalendarEvent[] = [];
    for (const uid of Object.keys(attendeeEvents)) {
      const evts = attendeeEvents[uid] || [];
      allAttEvents.push(...evts.filter(e => !e.allDay && isSameDay(parseISO(e.start), day)));
    }
    return allAttEvents;
  };

  const getDayLayout = (day: Date): LayoutEvent[] => {
    const googleEvts = getDayEvents(day).map((e, i) => ({
      id: e.id, start: e.start, end: e.end, source: 'google' as const, event: e, col: 0, totalCols: 1,
    }));
    const attEvts = getDayAttendeeEvents(day).map((e, i) => ({
      id: `att-${e.id || i}`, start: e.start, end: e.end, source: 'attendee' as const, event: e, col: 0, totalCols: 1,
    }));
    const items = [...googleEvts, ...attEvts];
    if (items.length === 0) return items;
    items.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());

    // Union-Find for overlap detection
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
        if (jStart < iEnd && jEnd > iStart) union(i, j);
      }
    }

    // Group by connected component
    const groups = new Map<number, number[]>();
    for (let i = 0; i < n; i++) {
      const root = find(i);
      if (!groups.has(root)) groups.set(root, []);
      groups.get(root)!.push(i);
    }

    // Greedy column assignment per group
    for (const [, indices] of groups) {
      indices.sort((a, b) => new Date(items[a].start).getTime() - new Date(items[b].start).getTime());
      const colEnds: number[] = [];
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
      const maxCol = Math.max(...indices.map(i => items[i].col));
      for (const idx of indices) items[idx].totalCols = maxCol + 1;
    }

    return items;
  };

  const getDragPreview = () => {
    if (!isDragging || !dragStart || !dragEnd) return null;
    const startY = Math.min(dragStart.y, dragEnd.y);
    const endY = Math.max(dragStart.y, dragEnd.y);
    return {
      top: startY,
      height: endY - startY,
      startTime: yToTime(startY),
      endTime: yToTime(endY),
    };
  };

  // Generate time options for select
  const timeOptions = Array.from({ length: (END_HOUR - START_HOUR) * 2 + 1 }, (_, i) => {
    const hour = START_HOUR + Math.floor(i / 2);
    const min = (i % 2) * 30;
    return `${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
  });

  const [mobileTab, setMobileTab] = useState<'settings' | 'calendar'>('settings');

  return (
    <div className="flex flex-col md:flex-row h-[calc(100vh-8rem)] gap-0 md:gap-4 -mx-4 sm:-mx-6 lg:-mx-8">
      {/* Mobile Tab Bar */}
      <div className="md:hidden flex border-b border-gray-200 bg-white shrink-0">
        <button
          onClick={() => setMobileTab('settings')}
          className={`flex-1 py-2.5 text-sm font-medium text-center transition-colors ${
            mobileTab === 'settings'
              ? 'text-blue-600 border-b-2 border-blue-600'
              : 'text-gray-500 hover:text-gray-700'
          }`}>
          <Settings className="w-4 h-4 inline mr-1" />設定
        </button>
        <button
          onClick={() => setMobileTab('calendar')}
          className={`flex-1 py-2.5 text-sm font-medium text-center transition-colors ${
            mobileTab === 'calendar'
              ? 'text-blue-600 border-b-2 border-blue-600'
              : 'text-gray-500 hover:text-gray-700'
          }`}>
          <Calendar className="w-4 h-4 inline mr-1" />カレンダー
        </button>
      </div>
      {/* Left Panel - Settings */}
      <div className={`w-full md:w-80 shrink-0 bg-white md:border-r border-gray-200 overflow-y-auto p-5 space-y-5 ${
        mobileTab !== 'settings' ? 'hidden md:block' : ''
      }`}>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <button onClick={() => router.push('/event-types')}
              className="p-1 hover:bg-gray-100 rounded-lg">
              <ArrowLeft className="w-5 h-5 text-gray-700" />
            </button>
            <h1 className="text-lg font-bold text-gray-900">
              {mode === 'edit' ? '予約リンク編集' : '予約リンク作成'}
            </h1>
          </div>
          <button onClick={handleSave} disabled={saving || !form.name}
            className="flex items-center gap-1.5 bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-xs font-medium">
            <Save className="w-3.5 h-3.5" />
            {saving ? '保存中...' : mode === 'edit' ? '更新' : '保存'}
          </button>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">名前 *</label>
          <input type="text" value={form.name}
            ref={nameInputRef}
            onChange={e => {
              const newName = e.target.value;
              // If user edits, stop auto-updating on duration change
              if (autoGeneratedNameRef.current && newName !== autoGeneratedNameRef.current) {
                autoGeneratedNameRef.current = null;
              }
              setForm({ ...form, name: newName });
            }}
            onFocus={e => e.target.select()}
            placeholder="例: 30分面談"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-700 focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">説明</label>
          <textarea value={form.description}
            onChange={e => setForm({ ...form, description: e.target.value })}
            rows={2} placeholder="予約者向けの説明"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-700 focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">所要時間</label>
          <select value={form.duration_minutes}
            onChange={e => {
              const newDuration = Number(e.target.value);
              // If name is still auto-generated, update it with new duration
              if (mode === 'create' && autoGeneratedNameRef.current && form.name === autoGeneratedNameRef.current) {
                const match = autoGeneratedNameRef.current.match(/^(\d+)分面談(\d+)$/);
                if (match) {
                  const newName = `${newDuration}分面談${match[2]}`;
                  autoGeneratedNameRef.current = newName;
                  setForm({ ...form, duration_minutes: newDuration, name: newName });
                  return;
                }
              }
              setForm({ ...form, duration_minutes: newDuration });
            }}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-700">
            <option value={15}>15分</option>
            <option value={30}>30分</option>
            <option value={45}>45分</option>
            <option value={60}>60分</option>
            <option value={90}>90分</option>
            <option value={120}>120分</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">場所</label>
          <div className="space-y-2">
            {[
              { value: 'online', label: 'オンライン', icon: Video, desc: 'Google Meet' },
              { value: 'offline', label: 'オフライン', icon: MapPin, desc: '対面' },
            ].map(opt => {
              const Icon = opt.icon;
              return (
                <button key={opt.value} type="button"
                  onClick={() => setForm({ ...form, location_type: opt.value as 'online' | 'offline' | 'both' })}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border text-sm text-left transition-colors ${
                    form.location_type === opt.value
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                  }`}>
                  <Icon className="w-4 h-4" />
                  <div>
                    <div className="font-medium">{opt.label}</div>
                    <div className="text-xs opacity-70">{opt.desc}</div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {form.location_type === 'offline' && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">場所の詳細</label>
            <input type="text" value={form.offline_location}
              onChange={e => setForm({ ...form, offline_location: e.target.value })}
              placeholder="住所や会議室名"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-700" />
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">前バッファ</label>
            <select value={form.buffer_before_minutes}
              onChange={e => setForm({ ...form, buffer_before_minutes: Number(e.target.value) })}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-700">
              <option value={0}>なし</option><option value={5}>5分</option>
              <option value={10}>10分</option><option value={15}>15分</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">後バッファ</label>
            <select value={form.buffer_after_minutes}
              onChange={e => setForm({ ...form, buffer_after_minutes: Number(e.target.value) })}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-700">
              <option value={0}>なし</option><option value={5}>5分</option>
              <option value={10}>10分</option><option value={15}>15分</option>
            </select>
          </div>
        </div>

        {/* Attendee Selection */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <svg className="w-4 h-4 text-purple-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
            <span className="text-sm font-medium text-gray-700">同席者</span>
          </div>

          {/* Selected attendees */}
          {selectedAttendeeIds.length > 0 && (
            <div className="space-y-1.5 mb-2">
              {selectedAttendeeIds.map(id => {
                const u = registeredUsers.find(ru => ru.id === id);
                if (!u) return null;
                return (
                  <div key={u.id} className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg border border-purple-300 bg-purple-50 text-sm">
                    {u.avatar_url ? (
                      <img src={u.avatar_url} alt="" className="w-6 h-6 rounded-full" />
                    ) : (
                      <div className="w-6 h-6 rounded-full bg-purple-200 flex items-center justify-center text-[10px] text-purple-700 font-bold">
                        {(u.name || u.email || '?')[0].toUpperCase()}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium text-purple-800 truncate">{u.name || '名前なし'}</div>
                      <div className="text-[10px] text-purple-600 truncate">{u.email}</div>
                    </div>
                    <button type="button"
                      onClick={() => setSelectedAttendeeIds(prev => prev.filter(aid => aid !== id))}
                      className="text-purple-400 hover:text-purple-600 shrink-0">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {/* Add attendee dropdown */}
          {registeredUsers.filter(u => !selectedAttendeeIds.includes(u.id) && u.id !== (managedUserId || currentUserId)).length > 0 && (
            <div className="relative" ref={attendeeDropdownRef}>
              <button type="button"
                onClick={() => setShowAttendeeDropdown(prev => !prev)}
                className="w-full flex items-center justify-center gap-1.5 text-sm text-purple-600 border border-dashed border-purple-300 rounded-lg py-2 hover:bg-purple-50 transition-colors font-medium">
                <Plus className="w-3.5 h-3.5" /> 同席者を追加
              </button>
              {showAttendeeDropdown && (
                <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                  {registeredUsers.filter(u => !selectedAttendeeIds.includes(u.id) && u.id !== (managedUserId || currentUserId)).map(u => (
                    <button key={u.id} type="button"
                      onClick={() => {
                        setSelectedAttendeeIds(prev => [...prev, u.id]);
                        setShowAttendeeDropdown(false);
                      }}
                      className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left text-sm hover:bg-gray-50 transition-colors border-b border-gray-100 last:border-b-0">
                      {u.avatar_url ? (
                        <img src={u.avatar_url} alt="" className="w-6 h-6 rounded-full" />
                      ) : (
                        <div className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center text-[10px] text-gray-700 font-bold">
                          {(u.name || u.email || '?')[0].toUpperCase()}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium text-gray-800 truncate">{u.name || '名前なし'}</div>
                        <div className="text-[10px] text-gray-500 truncate">{u.email}</div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {selectedAttendeeIds.length === 0 && registeredUsers.filter(u => !selectedAttendeeIds.includes(u.id) && u.id !== (managedUserId || currentUserId)).length === 0 && (
            <p className="text-xs text-gray-500">登録ユーザーがいません</p>
          )}
        </div>

        <ColorPicker
          value={form.color}
          onChange={color => setForm({ ...form, color })}
          label="カラー"
          hint="予約ページやカレンダー上での表示色"
        />

        {/* Email Template Selection */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-1.5">
            <Mail className="w-3.5 h-3.5" /> 確認メール
          </label>
          <div className="flex gap-2">
            <select
              value={form.email_template_id || ''}
              onChange={e => {
                if (e.target.value === '__new__') {
                  setShowNewTemplateModal(true);
                } else {
                  setForm({ ...form, email_template_id: e.target.value || null });
                }
              }}
              className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-700"
            >
              <option value="">デフォルト</option>
              {emailTemplates.filter(t => !t.is_default).map(t => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
              <option value="__new__">+ 新規テンプレート作成</option>
            </select>
          </div>
        </div>

        {/* Default Settings Section */}
        <div className="border-t border-gray-200 pt-4">
          <div className="flex items-center gap-2 mb-3">
            <Settings className="w-4 h-4 text-gray-600" />
            <span className="text-sm font-medium text-gray-700">デフォルト設定</span>
          </div>
          <div className="space-y-3">
            <div>
              <label className="block text-xs text-gray-700 mb-1">営業時間</label>
              <div className="flex items-center gap-1.5">
                <select value={businessHours.start}
                  onChange={e => {
                    const newBh = { ...businessHours, start: e.target.value };
                    setBusinessHours(newBh);
                    setDaySchedules(generateDefaultDaySchedules(newBh, breakTimes));
                  }}
                  className="flex-1 border border-gray-300 rounded-lg px-2 py-1.5 text-sm text-gray-700">
                  {timeOptions.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
                <span className="text-xs text-gray-500">〜</span>
                <select value={businessHours.end}
                  onChange={e => {
                    const newBh = { ...businessHours, end: e.target.value };
                    setBusinessHours(newBh);
                    setDaySchedules(generateDefaultDaySchedules(newBh, breakTimes));
                  }}
                  className="flex-1 border border-gray-300 rounded-lg px-2 py-1.5 text-sm text-gray-700">
                  {timeOptions.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs text-gray-700 mb-1">
                <Coffee className="w-3 h-3 inline mr-1" />休憩時間
              </label>
              {breakTimes.length > 0 && (
                <div className="space-y-1 mb-2">
                  {breakTimes.map((bt, idx) => (
                    <div key={idx} className="flex items-center justify-between bg-orange-50 rounded-lg px-2.5 py-1.5 text-xs">
                      <span className="text-orange-700">{bt.startTime} 〜 {bt.endTime}</span>
                      <button type="button" onClick={() => removeBreakTime(bt.startTime, bt.endTime)}
                        className="text-orange-400 hover:text-orange-600">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex items-center gap-1.5">
                <button type="button" onClick={addBreakTime}
                  className="text-orange-600 hover:text-orange-700 border border-orange-200 rounded-lg px-2 py-1.5 hover:bg-orange-50 transition-colors">
                  <Plus className="w-3.5 h-3.5" />
                </button>
                <select value={breakForm.startTime}
                  onChange={e => setBreakForm({ ...breakForm, startTime: e.target.value })}
                  className="flex-1 border border-gray-300 rounded-lg px-2 py-1.5 text-xs text-gray-700">
                  {timeOptions.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
                <span className="text-xs text-gray-500">〜</span>
                <select value={breakForm.endTime}
                  onChange={e => setBreakForm({ ...breakForm, endTime: e.target.value })}
                  className="flex-1 border border-gray-300 rounded-lg px-2 py-1.5 text-xs text-gray-700">
                  {timeOptions.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <p className="text-[10px] text-gray-500 mt-1">休憩時間は全日で自動適用されます</p>
            </div>

            {/* Day Schedule Section */}
            <div>
              <label className="block text-xs text-gray-700 mb-1">
                <Calendar className="w-3 h-3 inline mr-1" />曜日・時間帯
              </label>
              <div className="flex flex-wrap gap-1 mb-2">
                {DAY_LABELS.map((label, idx) => {
                  const ranges = daySchedules[String(idx)];
                  const hasSchedule = ranges && ranges.length > 0;
                  const display = getDayScheduleDisplay(idx);
                  return (
                    <div key={idx} className={`text-[10px] px-1.5 py-0.5 rounded ${
                      hasSchedule ? 'bg-blue-50 text-blue-700 border border-blue-200' : 'bg-gray-50 text-gray-400 border border-gray-100'
                    }`}>
                      <span className="font-medium">{label}</span>
                      {hasSchedule && <span className="ml-0.5">{display}</span>}
                    </div>
                  );
                })}
              </div>
              <button type="button" onClick={openDayScheduleModal}
                className="w-full text-xs text-blue-600 border border-blue-200 rounded-lg py-1.5 hover:bg-blue-50 transition-colors font-medium">
                曜日・時間帯を変更
              </button>
            </div>

            {/* Booking Period Settings */}
            <div>
              <label className="block text-xs text-gray-700 mb-1">開始日</label>
              <select value={bookingStartOffsetDays}
                onChange={e => setBookingStartOffsetDays(Number(e.target.value))}
                className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs text-gray-700">
                <option value={0}>今日から</option>
                <option value={1}>明日から</option>
                <option value={2}>明後日から</option>
                <option value={3}>3日後から</option>
                <option value={7}>1週間後から</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-700 mb-1">期間</label>
              <select value={bookingEndType === 'specific_date' ? 'specific_date' : bookingEndValue}
                onChange={e => {
                  const val = e.target.value;
                  if (val === 'specific_date') {
                    setBookingEndType('specific_date');
                  } else {
                    setBookingEndType('months');
                    setBookingEndValue(val);
                  }
                }}
                className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs text-gray-700">
                <option value="1">1ヶ月間</option>
                <option value="2">2ヶ月間</option>
                <option value="3">3ヶ月間</option>
                <option value="specific_date">特定日まで</option>
              </select>
              {bookingEndType === 'specific_date' && (
                <input type="date" value={bookingEndDate}
                  onChange={e => setBookingEndDate(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs text-gray-700 mt-1.5" />
              )}
            </div>
          </div>
        </div>

        {/* Schedule Pattern Section */}
        <div className="border-t border-gray-200 pt-4">
          <div className="flex items-center gap-2 mb-3">
            <Repeat className="w-4 h-4 text-blue-500" />
            <span className="text-sm font-medium text-gray-700">スケジュールパターン</span>
          </div>

          <div className="space-y-3">
            <select value={schedulePattern.type}
              onChange={e => setSchedulePattern({ ...schedulePattern, type: e.target.value as SchedulePatternType })}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-700">
              <option value="none">手動設定のみ</option>
              <option value="specific_days">曜日指定</option>
              <option value="biweekly">隔週</option>
              <option value="month_end">月末</option>
              <option value="nth_weekday">第N曜日</option>
              <option value="specific_dates">特定日</option>
            </select>

            {schedulePattern.type === 'specific_days' && (
              <div>
                <label className="block text-xs text-gray-700 mb-1.5">対象曜日</label>
                <div className="flex gap-1">
                  {DAY_LABELS.map((label, idx) => (
                    <button key={idx} type="button"
                      onClick={() => {
                        const days = schedulePattern.selectedDays.includes(idx)
                          ? schedulePattern.selectedDays.filter(d => d !== idx)
                          : [...schedulePattern.selectedDays, idx];
                        setSchedulePattern({ ...schedulePattern, selectedDays: days });
                      }}
                      className={`w-8 h-8 rounded-full text-xs font-medium transition-colors ${
                        schedulePattern.selectedDays.includes(idx)
                          ? idx === 0 ? 'bg-red-500 text-white' : idx === 6 ? 'bg-blue-500 text-white' : 'bg-blue-600 text-white'
                          : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                      }`}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {schedulePattern.type === 'biweekly' && (
              <div className="space-y-2">
                <div>
                  <label className="block text-xs text-gray-700 mb-1">週の選択</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button type="button" onClick={() => setSchedulePattern({ ...schedulePattern, biweeklyWeek: 1 })}
                      className={`px-3 py-1.5 rounded-lg text-xs border ${schedulePattern.biweeklyWeek === 1 ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-700'}`}>
                      奇数週
                    </button>
                    <button type="button" onClick={() => setSchedulePattern({ ...schedulePattern, biweeklyWeek: 2 })}
                      className={`px-3 py-1.5 rounded-lg text-xs border ${schedulePattern.biweeklyWeek === 2 ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-700'}`}>
                      偶数週
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-gray-700 mb-1.5">対象曜日</label>
                  <div className="flex gap-1">
                    {DAY_LABELS.map((label, idx) => (
                      <button key={idx} type="button"
                        onClick={() => {
                          const days = schedulePattern.biweeklyDays.includes(idx)
                            ? schedulePattern.biweeklyDays.filter(d => d !== idx)
                            : [...schedulePattern.biweeklyDays, idx];
                          setSchedulePattern({ ...schedulePattern, biweeklyDays: days });
                        }}
                        className={`w-8 h-8 rounded-full text-xs font-medium transition-colors ${
                          schedulePattern.biweeklyDays.includes(idx) ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                        }`}>
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {schedulePattern.type === 'month_end' && (
              <div>
                <label className="block text-xs text-gray-700 mb-1">月末から何日前</label>
                <select value={schedulePattern.monthEndDaysBefore}
                  onChange={e => setSchedulePattern({ ...schedulePattern, monthEndDaysBefore: Number(e.target.value) })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm text-gray-700">
                  <option value={0}>月末日（最終日）</option>
                  <option value={1}>月末前日</option>
                  <option value={2}>月末2日前</option>
                  <option value={3}>月末3日前</option>
                  <option value={4}>月末4日前</option>
                  <option value={5}>月末5日前</option>
                </select>
              </div>
            )}

            {schedulePattern.type === 'nth_weekday' && (
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs text-gray-700 mb-1">第N</label>
                  <select value={schedulePattern.nthWeek}
                    onChange={e => setSchedulePattern({ ...schedulePattern, nthWeek: Number(e.target.value) })}
                    className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm text-gray-700">
                    <option value={1}>第1</option>
                    <option value={2}>第2</option>
                    <option value={3}>第3</option>
                    <option value={4}>第4</option>
                    <option value={5}>第5</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-700 mb-1">曜日</label>
                  <select value={schedulePattern.nthWeekday}
                    onChange={e => setSchedulePattern({ ...schedulePattern, nthWeekday: Number(e.target.value) })}
                    className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm text-gray-700">
                    {DAY_LABELS.map((label, idx) => (
                      <option key={idx} value={idx}>{label}曜日</option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            {schedulePattern.type === 'specific_dates' && (
              <div>
                <label className="block text-xs text-gray-700 mb-1">日付を追加</label>
                <div className="flex gap-1">
                  <input type="date"
                    className="flex-1 border border-gray-300 rounded-lg px-2 py-1.5 text-sm"
                    onChange={e => {
                      if (e.target.value && !schedulePattern.specificDates.includes(e.target.value)) {
                        setSchedulePattern({
                          ...schedulePattern,
                          specificDates: [...schedulePattern.specificDates, e.target.value].sort(),
                        });
                      }
                    }} />
                </div>
                {schedulePattern.specificDates.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {schedulePattern.specificDates.map(d => (
                      <span key={d} className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 text-xs px-2 py-0.5 rounded-full">
                        {d}
                        <button type="button" onClick={() => setSchedulePattern({
                          ...schedulePattern,
                          specificDates: schedulePattern.specificDates.filter(sd => sd !== d),
                        })} className="hover:text-red-500"><X className="w-3 h-3" /></button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}

            {schedulePattern.type !== 'none' && (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs text-gray-700 mb-1">開始時間</label>
                    <select value={schedulePattern.timeStart}
                      onChange={e => setSchedulePattern({ ...schedulePattern, timeStart: e.target.value })}
                      className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm text-gray-700">
                      {timeOptions.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-700 mb-1">終了時間</label>
                    <select value={schedulePattern.timeEnd}
                      onChange={e => setSchedulePattern({ ...schedulePattern, timeEnd: e.target.value })}
                      className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm text-gray-700">
                      {timeOptions.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs text-gray-700 mb-1">先何ヶ月分</label>
                  <select value={schedulePattern.monthsAhead}
                    onChange={e => setSchedulePattern({ ...schedulePattern, monthsAhead: Number(e.target.value) })}
                    className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm text-gray-700">
                    <option value={1}>1ヶ月</option>
                    <option value={2}>2ヶ月</option>
                    <option value={3}>3ヶ月</option>
                    <option value={6}>6ヶ月</option>
                  </select>
                </div>

                <button type="button" onClick={generateSlotsFromPattern}
                  className="w-full flex items-center justify-center gap-1.5 text-sm text-blue-600 border border-blue-200 rounded-lg py-2 hover:bg-blue-50 transition-colors font-medium">
                  <Calendar className="w-3.5 h-3.5" /> パターンからスロット生成
                </button>
              </>
            )}
          </div>
        </div>

        {/* Blocked Times Section - Hidden: covered by business hours + breaks + Google Calendar.
           To re-enable, set SHOW_BLOCKED_TIMES = true at the top of the file. */}
        <div className="border-t border-gray-200 pt-4" style={{ display: SHOW_BLOCKED_TIMES ? undefined : 'none' }}>
          <div className="flex items-center gap-2 mb-3">
            <Ban className="w-4 h-4 text-red-500" />
            <span className="text-sm font-medium text-gray-700">予約不可の時間</span>
          </div>

          {/* Mode toggle: single / batch */}
          <div className="grid grid-cols-2 gap-1.5 mb-3">
            <button type="button"
              onClick={() => setBlockedForm({ ...blockedForm, mode: 'single' })}
              className={`text-xs py-1.5 rounded-lg font-medium border transition-colors ${
                blockedForm.mode === 'single'
                  ? 'border-red-400 bg-red-50 text-red-700'
                  : 'border-gray-200 text-gray-500 hover:bg-gray-50'
              }`}>
              単日指定
            </button>
            <button type="button"
              onClick={() => setBlockedForm({ ...blockedForm, mode: 'batch' })}
              className={`text-xs py-1.5 rounded-lg font-medium border transition-colors ${
                blockedForm.mode === 'batch'
                  ? 'border-red-400 bg-red-50 text-red-700'
                  : 'border-gray-200 text-gray-500 hover:bg-gray-50'
              }`}>
              一括指定
            </button>
          </div>

          <div className="space-y-2 mb-3">
            {blockedForm.mode === 'single' ? (
              <div>
                <label className="block text-xs text-gray-700 mb-1">日付</label>
                <input type="date" value={blockedForm.date}
                  onChange={e => setBlockedForm({ ...blockedForm, date: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm text-gray-700" />
              </div>
            ) : (
              <>
                <div>
                  <label className="block text-xs text-gray-700 mb-1">期間</label>
                  <select value={blockedForm.period}
                    onChange={e => setBlockedForm({ ...blockedForm, period: e.target.value as typeof blockedForm.period })}
                    className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm text-gray-700">
                    <option value="this_month">今月</option>
                    <option value="next_month">来月</option>
                    <option value="1month">1ヶ月間</option>
                    <option value="2months">2ヶ月間</option>
                    <option value="custom">任意の範囲</option>
                  </select>
                </div>
                {blockedForm.period === 'custom' && (
                  <div className="flex items-center gap-1.5">
                    <input type="date" value={blockedForm.dateFrom}
                      onChange={e => setBlockedForm({ ...blockedForm, dateFrom: e.target.value })}
                      className="flex-1 border border-gray-300 rounded-lg px-2 py-1.5 text-xs text-gray-700" />
                    <span className="text-xs text-gray-500">〜</span>
                    <input type="date" value={blockedForm.dateTo}
                      onChange={e => setBlockedForm({ ...blockedForm, dateTo: e.target.value })}
                      className="flex-1 border border-gray-300 rounded-lg px-2 py-1.5 text-xs text-gray-700" />
                  </div>
                )}
                <div>
                  <label className="block text-xs text-gray-700 mb-1">対象日</label>
                  <select value={blockedForm.dayFilter}
                    onChange={e => setBlockedForm({ ...blockedForm, dayFilter: e.target.value as typeof blockedForm.dayFilter })}
                    className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm text-gray-700">
                    <option value="all">すべての日</option>
                    <option value="weekdays">平日のみ</option>
                    <option value="weekends_holidays">土日祝のみ</option>
                    <option value="specific_days">曜日指定</option>
                  </select>
                </div>
                {blockedForm.dayFilter === 'specific_days' && (
                  <div className="flex gap-1">
                    {DAY_LABELS.map((label, idx) => (
                      <button key={idx} type="button"
                        onClick={() => {
                          const days = blockedForm.selectedDays.includes(idx)
                            ? blockedForm.selectedDays.filter(d => d !== idx)
                            : [...blockedForm.selectedDays, idx];
                          setBlockedForm({ ...blockedForm, selectedDays: days });
                        }}
                        className={`w-8 h-8 rounded-full text-xs font-medium transition-colors ${
                          blockedForm.selectedDays.includes(idx)
                            ? idx === 0 ? 'bg-red-500 text-white' : idx === 6 ? 'bg-blue-500 text-white' : 'bg-red-600 text-white'
                            : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                        }`}>
                        {label}
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs text-gray-700 mb-1">開始</label>
                <select value={blockedForm.startTime}
                  onChange={e => setBlockedForm({ ...blockedForm, startTime: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm text-gray-700">
                  {timeOptions.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-700 mb-1">終了</label>
                <select value={blockedForm.endTime}
                  onChange={e => setBlockedForm({ ...blockedForm, endTime: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm text-gray-700">
                  {timeOptions.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            </div>
            <button onClick={addBlockedTime} type="button"
              className="w-full flex items-center justify-center gap-1 text-sm text-red-600 border border-red-200 rounded-lg py-1.5 hover:bg-red-50 transition-colors">
              <Plus className="w-3.5 h-3.5" /> 追加
            </button>
          </div>

          {/* Blocked times list - grouped by time range */}
          {blockedTimes.length > 0 && (() => {
            // Group by time range
            const groups: Record<string, BlockedTime[]> = {};
            for (const b of blockedTimes) {
              const key = `${b.startTime}-${b.endTime}`;
              if (!groups[key]) groups[key] = [];
              groups[key].push(b);
            }
            const groupEntries = Object.entries(groups);

            return (
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {groupEntries.map(([timeKey, items]) => (
                  items.length > 3 ? (
                    <div key={timeKey} className="bg-red-50 rounded-lg px-2.5 py-1.5 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="text-red-700 font-medium">{timeKey} × {items.length}日</span>
                        <button type="button" onClick={() => removeBatchBlockedTimes(items[0].startTime, items[0].endTime)}
                          className="text-red-400 hover:text-red-600 text-[10px]">
                          一括削除
                        </button>
                      </div>
                      <div className="text-[10px] text-red-500 mt-0.5 truncate">
                        {items.slice(0, 5).map(b => b.date.slice(5)).join(', ')}
                        {items.length > 5 && ` 他${items.length - 5}件`}
                      </div>
                    </div>
                  ) : (
                    items.map((b, idx) => (
                      <div key={`${timeKey}-${idx}`} className="flex items-center justify-between bg-red-50 rounded-lg px-2.5 py-1.5 text-xs">
                        <span className="text-red-700">{b.date} {b.startTime}-{b.endTime}</span>
                        <button type="button" onClick={() => removeBlockedTime(b.date, b.startTime, b.endTime)}
                          className="text-red-400 hover:text-red-600">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))
                  )
                ))}
              </div>
            );
          })()}

          <p className="text-[10px] text-gray-600 mt-2">
            カレンダー上で右クリック+ドラッグでも追加可。切替: 下のモードボタン
          </p>
        </div>

        {/* Drag mode toggle - hidden: only slot mode needed since blocked times is disabled.
           To re-enable, set SHOW_BLOCKED_TIMES = true at the top of the file. */}
        <div className="border-t border-gray-200 pt-4" style={{ display: SHOW_BLOCKED_TIMES ? undefined : 'none' }}>
          <label className="block text-sm font-medium text-gray-700 mb-2">ドラッグモード</label>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setDragMode('slot')}
              className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border transition-colors ${
                dragMode === 'slot'
                  ? 'border-green-500 bg-green-50 text-green-700'
                  : 'border-gray-200 text-gray-500 hover:bg-gray-50'
              }`}>
              <Check className="w-3.5 h-3.5" /> 予約可能
            </button>
            <button type="button" onClick={() => setDragMode('block')}
              className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border transition-colors ${
                dragMode === 'block'
                  ? 'border-red-500 bg-red-50 text-red-700'
                  : 'border-gray-200 text-gray-500 hover:bg-gray-50'
              }`}>
              <Ban className="w-3.5 h-3.5" /> 予約不可
            </button>
          </div>
        </div>

        {/* Slot summary */}
        <div className="p-3 bg-gray-50 rounded-lg">
          <div className="text-sm font-medium text-gray-700 mb-1">配置可能スロット</div>
          <div className="text-2xl font-bold text-blue-600">{emptySlotCount}</div>
          <div className="text-xs text-gray-700 mt-1">
            カレンダー上でドラッグして追加できます
          </div>
          <div className="grid grid-cols-2 gap-2 mt-3">
            <button type="button" onClick={autoPopulateEmptySpaces}
              className="flex items-center justify-center gap-1 text-xs text-blue-600 border border-blue-200 rounded-lg py-1.5 hover:bg-blue-50 transition-colors font-medium">
              <Wand2 className="w-3 h-3" /> 自動配置
            </button>
            <button type="button" onClick={resetAllSlots}
              className="flex items-center justify-center gap-1 text-xs text-gray-600 border border-gray-200 rounded-lg py-1.5 hover:bg-gray-50 transition-colors font-medium">
              <RotateCcw className="w-3 h-3" /> リセット
            </button>
          </div>
        </div>

        {/* Memo/Comments section (edit mode only) */}
        {mode === 'edit' && eventTypeId && (
          <CommentSection
            targetType="event_type"
            targetId={eventTypeId}
            currentUserId={currentUserId}
          />
        )}

        <button onClick={handleSave} disabled={saving || !form.name}
          className="w-full flex items-center justify-center gap-2 bg-blue-600 text-white py-2.5 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium">
          <Save className="w-4 h-4" />
          {saving ? '保存中...' : mode === 'edit' ? '予約リンクを更新' : '予約リンクを作成'}
        </button>
      </div>

      {/* Right Panel - Calendar */}
      <div className={`flex-1 bg-white md:rounded-xl shadow-sm md:border border-gray-200 overflow-hidden flex flex-col ${
        mobileTab !== 'calendar' ? 'hidden md:flex' : ''
      }`}>
        {/* Calendar Navigation */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-gray-200 shrink-0 gap-1">
          <button onClick={() => setCurrentWeekStart(prev => freeScroll ? addDays(prev, -1) : addDays(prev, -viewDays))}
            className="p-1 hover:bg-gray-100 rounded-lg shrink-0">
            <ChevronLeft className="w-5 h-5 text-gray-600" />
          </button>
          <span className="text-sm font-medium text-gray-900 whitespace-nowrap">
            {viewDays === 1
              ? format(currentWeekStart, 'yyyy年M月d日(E)', { locale: ja })
              : `${format(currentWeekStart, 'yyyy年M月d日', { locale: ja })} - ${format(addDays(currentWeekStart, viewDays - 1), ' M月d日', { locale: ja })}`
            }
          </span>
          <button onClick={() => setCurrentWeekStart(prev => freeScroll ? addDays(prev, 1) : addDays(prev, viewDays))}
            className="p-1 hover:bg-gray-100 rounded-lg shrink-0">
            <ChevronRight className="w-5 h-5 text-gray-600" />
          </button>
          <select value={viewDays}
            onChange={e => { setViewDays(Number(e.target.value) as typeof viewDays); cacheRef.current = null; }}
            className="text-xs border border-gray-300 rounded-lg px-1.5 py-1 text-gray-700 shrink-0">
            <option value={1}>1日</option>
            <option value={3}>3日</option>
            <option value={7}>1週間</option>
            <option value={10}>10日</option>
            <option value={14}>2週間</option>
          </select>
          <label className="flex items-center gap-1 cursor-pointer select-none shrink-0">
            <input type="checkbox" checked={freeScroll}
              onChange={e => setFreeScroll(e.target.checked)}
              className="w-3.5 h-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
            <span className="text-xs text-gray-600 whitespace-nowrap">横スクロール</span>
          </label>
          <label className="flex items-center gap-1 cursor-pointer select-none shrink-0">
            <input type="checkbox" checked={editMode}
              onChange={e => setEditMode(e.target.checked)}
              className="w-3.5 h-3.5 rounded border-gray-300 text-orange-500 focus:ring-orange-400" />
            <span className="text-xs text-gray-600 whitespace-nowrap">編集モード</span>
          </label>
        </div>

        {initialLoad && loading ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
          </div>
        ) : (
          <div className="flex-1 overflow-auto relative" ref={calendarRef}>
            {loading && !initialLoad && (
              <div className="absolute top-2 right-2 z-50">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600" />
              </div>
            )}
            {/* Day headers with all-day checkboxes */}
            <div className="grid sticky top-0 bg-white z-40 border-b border-gray-200"
              style={{ gridTemplateColumns: `48px repeat(${viewDays}, 1fr)` }}>
              <div className="w-12" />
              {weekDays.map(day => {
                const dateStr = format(day, 'yyyy-MM-dd');
                const isToday = isSameDay(day, new Date());
                return (
                  <div key={dateStr} className="text-center py-2 border-l border-gray-100">
                    <div className="text-xs text-gray-700">{format(day, 'EEE', { locale: ja })}</div>
                    <div className={`text-sm font-semibold ${isToday ? 'text-blue-600' : 'text-gray-900'}`}>
                      {format(day, 'd')}
                    </div>
                    <label className="inline-flex items-center gap-1 mt-1 cursor-pointer" title="全日NG">
                      <input type="checkbox"
                        checked={!!allDayChecked[dateStr]}
                        onChange={() => toggleAllDayNG(day)}
                        className="w-3 h-3 rounded text-red-600 border-gray-300" />
                      <span className={`text-[10px] ${allDayChecked[dateStr] ? 'text-red-600 font-medium' : 'text-gray-600'}`}>全日NG</span>
                    </label>
                  </div>
                );
              })}
            </div>

            {/* Time grid */}
            <div className="grid relative" ref={calendarGridRef}
              style={{ gridTemplateColumns: `48px repeat(${viewDays}, 1fr)` }}>
              {/* Hour labels */}
              <div className="relative">
                {Array.from({ length: TOTAL_HOURS }, (_, i) => (
                  <div key={i} className="border-t border-gray-100 text-right pr-1 relative"
                    style={{ height: `${HOUR_HEIGHT}px` }}>
                    <span className="text-[10px] text-gray-600 absolute -top-2 right-1">
                      {String(START_HOUR + i).padStart(2, '0')}:00
                    </span>
                  </div>
                ))}
              </div>
              {/* Day columns */}
              {weekDays.map(day => {
                const dateStr = format(day, 'yyyy-MM-dd');
                const dayLayout = getDayLayout(day);
                const daySlots = getDaySlots(day);
                const dayBlocked = getDayBlockedTimes(day);
                const isPastDay = startOfDay(day) < startOfDay(new Date());
                const preview = isDragging && dragStart && isSameDay(dragStart.day, day)
                  ? getDragPreview() : null;

                return (
                  <div key={dateStr}
                    data-daycolumn={dateStr}
                    className="border-l border-gray-100 relative select-none"
                    style={{ height: `${TOTAL_HOURS * HOUR_HEIGHT}px`, cursor: editMode ? 'default' : (movingSlot ? 'grabbing' : (dragMode === 'slot' ? 'crosshair' : 'not-allowed')) }}
                    onMouseDown={(e) => { if (!editMode) handleMouseDown(day, e); }}
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUp}
                    onMouseLeave={() => { if (isDragging) handleMouseUp(); }}
                  >
                    {/* Hour grid lines */}
                    {Array.from({ length: TOTAL_HOURS }, (_, i) => (
                      <div key={i} className="border-t border-gray-100 absolute w-full"
                        style={{ top: `${i * HOUR_HEIGHT}px`, height: `${HOUR_HEIGHT}px` }} />
                    ))}

                    {/* Business hours greyout - before business hours */}
                    {(() => {
                      const [bhs] = businessHours.start.split(':').map(Number);
                      const beforeHeight = Math.max(0, (bhs - START_HOUR)) * HOUR_HEIGHT;
                      return beforeHeight > 0 ? (
                        <div className="absolute left-0 right-0 bg-gray-100 opacity-50 pointer-events-none z-[5]"
                          style={{ top: 0, height: `${beforeHeight}px` }} />
                      ) : null;
                    })()}
                    {/* Business hours greyout - after business hours */}
                    {(() => {
                      const [bhe] = businessHours.end.split(':').map(Number);
                      const afterTop = Math.max(0, (bhe - START_HOUR)) * HOUR_HEIGHT;
                      const afterHeight = (TOTAL_HOURS * HOUR_HEIGHT) - afterTop;
                      return afterHeight > 0 ? (
                        <div className="absolute left-0 right-0 bg-gray-100 opacity-50 pointer-events-none z-[5]"
                          style={{ top: `${afterTop}px`, height: `${afterHeight}px` }} />
                      ) : null;
                    })()}

                    {/* Break time overlays (orange stripe on all days) */}
                    {breakTimes.map((bt, btIdx) => {
                      const pos = getSlotPosition(bt.startTime, bt.endTime);
                      return (
                        <div key={`break-${btIdx}`}
                          className="absolute left-0 right-0 pointer-events-none z-[6]"
                          style={{
                            top: `${pos.top}px`,
                            height: `${pos.height}px`,
                            backgroundColor: 'rgba(251, 146, 60, 0.12)',
                            backgroundImage: 'repeating-linear-gradient(135deg, transparent, transparent 3px, rgba(251,146,60,0.15) 3px, rgba(251,146,60,0.15) 6px)',
                          }}>
                          <div className="text-[9px] text-orange-500 px-1 truncate opacity-70">
                            <Coffee className="w-2.5 h-2.5 inline mr-0.5" />休憩
                          </div>
                        </div>
                      );
                    })}

                    {/* Calendar events (layout-based column rendering) */}
                    {dayLayout.map(le => {
                      const pos = getEventPosition(le.event);
                      const leftPercent = le.col * (100 / le.totalCols);
                      const widthPercent = 100 / le.totalCols;
                      const isTransparentEvent = le.event.transparency === 'transparent';
                      const colorClass = isPastDay
                        ? 'bg-gray-100 border border-gray-200 text-gray-400 opacity-70'
                        : le.source === 'attendee'
                          ? 'bg-purple-50 border border-purple-200 text-purple-600 opacity-80 hover:opacity-100'
                          : isTransparentEvent
                            ? 'bg-green-50 border-2 border-dashed border-green-300 text-green-700 opacity-80 hover:opacity-100'
                            : le.event.allowOverlap
                              ? 'bg-yellow-50 border border-yellow-200 text-yellow-700 opacity-60 hover:opacity-90'
                              : 'bg-red-50 border border-red-200 text-red-600 opacity-80 hover:opacity-100';
                      return (
                        <div key={le.id}
                          className={`absolute rounded px-1 py-0.5 text-[10px] z-10 overflow-hidden ${colorClass} ${
                            editMode && le.source === 'google' && le.event.isOrganizer !== false ? 'cursor-grab' : !editMode && le.source === 'google' ? 'cursor-pointer' : 'cursor-default'
                          }`}
                          style={{
                            top: `${pos.top}px`,
                            height: `${pos.height}px`,
                            left: `${leftPercent}%`,
                            width: `${widthPercent}%`,
                            paddingLeft: '2px',
                            paddingRight: '2px',
                          }}
                          onMouseEnter={e => handleCalEventMouseEnter(e, le.event)}
                          onMouseLeave={handleCalEventMouseLeave}
                          onClick={(e) => {
                            if (!editMode && le.source === 'google' && !hasCalEventMovedRef.current && !hasMovedRef.current) {
                              e.stopPropagation();
                              toggleEventTransparency(le.event);
                            }
                          }}
                          onMouseDown={(e) => {
                            if (editMode && le.source === 'google' && le.event.isOrganizer !== false) {
                              e.stopPropagation();
                              handleEventDragStart(e, le.event);
                            }
                            // In non-editMode: don't stopPropagation so drag-to-create works through events
                          }}>
                          {editMode && le.source === 'google' && le.event.isOrganizer !== false && (
                            <div className="absolute top-0 left-0 right-0 h-[3px] cursor-ns-resize hover:bg-blue-400/50 z-20"
                              onMouseDown={(e) => { e.stopPropagation(); handleResizeStart(e, le.event, 'top'); }} />
                          )}
                          <div className="truncate font-medium">
                            {isTransparentEvent && '✅ '}{le.event.summary}
                          </div>
                          {pos.height > 20 && (
                            <div className="truncate opacity-70">
                              {format(parseISO(le.event.start), 'HH:mm')}-{format(parseISO(le.event.end), 'HH:mm')}
                            </div>
                          )}
                          {editMode && le.source === 'google' && le.event.isOrganizer !== false && (
                            <div className="absolute bottom-0 left-0 right-0 h-[3px] cursor-ns-resize hover:bg-blue-400/50 z-20"
                              onMouseDown={(e) => { e.stopPropagation(); handleResizeStart(e, le.event, 'bottom'); }} />
                          )}
                        </div>
                      );
                    })}

                    {/* Edit mode: move preview */}
                    {movingCalEvent && (() => {
                      const origStart = parseISO(movingCalEvent.start);
                      if (!isSameDay(origStart, day)) return null;
                      const rawY = calEventMoveY - calEventMoveOffset;
                      const snappedY = Math.round(rawY / (HOUR_HEIGHT / 4)) * (HOUR_HEIGHT / 4);
                      const durationMs = new Date(movingCalEvent.end).getTime() - new Date(movingCalEvent.start).getTime();
                      const durationPx = (durationMs / (1000 * 60 * 60)) * HOUR_HEIGHT;
                      return (
                        <div className="absolute left-0.5 right-0.5 rounded bg-blue-100 border-2 border-blue-400 border-dashed opacity-70 z-30 pointer-events-none px-1 py-0.5 text-[10px] text-blue-700"
                          style={{ top: `${Math.max(0, snappedY)}px`, height: `${durationPx}px` }}>
                          <div className="truncate font-medium">{movingCalEvent.summary}</div>
                        </div>
                      );
                    })()}

                    {/* Edit mode: resize preview */}
                    {resizingCalEvent && (() => {
                      const origStart = parseISO(resizingCalEvent.start);
                      if (!isSameDay(origStart, day)) return null;
                      const pos = getEventPosition(resizingCalEvent);
                      const snappedY = Math.round(resizeY / (HOUR_HEIGHT / 4)) * (HOUR_HEIGHT / 4);
                      let previewTop = pos.top;
                      let previewHeight = pos.height;
                      if (resizeEdge === 'top') {
                        previewTop = Math.max(0, snappedY);
                        previewHeight = pos.top + pos.height - previewTop;
                      } else {
                        previewHeight = Math.max(HOUR_HEIGHT / 4, snappedY - pos.top);
                      }
                      return (
                        <div className="absolute left-0.5 right-0.5 rounded bg-blue-100 border-2 border-blue-400 border-dashed opacity-70 z-30 pointer-events-none px-1 py-0.5 text-[10px] text-blue-700"
                          style={{ top: `${previewTop}px`, height: `${previewHeight}px` }}>
                          <div className="truncate font-medium">{resizingCalEvent.summary}</div>
                        </div>
                      );
                    })()}

                    {/* Blocked times (red striped) */}
                    {dayBlocked.map((b, idx) => {
                      const pos = getSlotPosition(b.startTime, b.endTime);
                      return (
                        <div key={`blocked-${idx}`}
                          className="absolute left-0.5 right-0.5 rounded bg-red-100 border border-red-300 text-red-700 px-1 py-0.5 text-[10px] z-15 cursor-pointer group"
                          style={{ top: `${pos.top}px`, height: `${pos.height}px`, backgroundImage: 'repeating-linear-gradient(135deg, transparent, transparent 3px, rgba(239,68,68,0.15) 3px, rgba(239,68,68,0.15) 6px)' }}
                          onClick={(e) => { e.stopPropagation(); removeBlockedTime(b.date, b.startTime, b.endTime); }}>
                          <div className="flex items-center justify-between">
                            <span className="truncate font-medium"><Ban className="w-2.5 h-2.5 inline mr-0.5" />{b.startTime}-{b.endTime}</span>
                            <span className="hidden group-hover:inline text-red-500 text-[9px] font-bold ml-1">✕</span>
                          </div>
                          {pos.height > 16 && <div className="text-[9px] opacity-60">予約不可</div>}
                        </div>
                      );
                    })}

                    {/* Custom bookable slots (green) */}
                    {daySlots.map((slot, idx) => {
                      const pos = getSlotPosition(slot.startTime, slot.endTime);
                      const isBeingMoved = movingSlot &&
                        movingSlot.date === slot.date &&
                        movingSlot.startTime === slot.startTime &&
                        movingSlot.endTime === slot.endTime;
                      return (
                        <div key={`${slot.startTime}-${slot.endTime}-${idx}`}
                          className={`absolute left-0.5 right-0.5 rounded bg-green-100 border border-green-400 text-green-800 px-1 py-0.5 text-[10px] z-20 group overflow-hidden ${
                            isBeingMoved ? 'opacity-30' : ''
                          }`}
                          style={{ top: `${pos.top}px`, height: `${pos.height}px`, cursor: dragMode === 'slot' ? 'grab' : 'pointer' }}
                          onMouseDown={() => {
                            if (dragMode === 'slot') {
                              // Let handleMouseDown on parent handle move detection
                              return;
                            }
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (!hasMovedRef.current) {
                              removeSlot(slot.date, slot.startTime, slot.endTime);
                            }
                          }}>
                          <div className="flex items-center justify-between leading-tight">
                            <span className="truncate font-medium">
                              {slot.isAllDay ? '全日' : `${slot.startTime}-${slot.endTime}`}
                            </span>
                            <span className="hidden group-hover:inline text-red-500 text-[9px] font-bold ml-1 flex-shrink-0">✕</span>
                          </div>
                          {/* Time range shown in block above is sufficient */}
                        </div>
                      );
                    })}

                    {/* Move preview ghost */}
                    {movingSlot && isDragging && hasMovedRef.current && dragEnd && isSameDay(dragStart!.day, day) && (() => {
                      const newY = dragEnd.y - moveOffset;
                      const newStartTime = yToTime(Math.max(0, newY));
                      const [osh, osm] = movingSlot.startTime.split(':').map(Number);
                      const [oeh, oem] = movingSlot.endTime.split(':').map(Number);
                      const durationMin = (oeh * 60 + oem) - (osh * 60 + osm);
                      const [nsh, nsm] = newStartTime.split(':').map(Number);
                      const newEndMinutes = nsh * 60 + nsm + durationMin;
                      const newEndHour = Math.floor(newEndMinutes / 60);
                      const newEndMin = newEndMinutes % 60;
                      const newEndTime = `${String(Math.min(newEndHour, END_HOUR)).padStart(2, '0')}:${String(newEndMin).padStart(2, '0')}`;
                      const pos = getSlotPosition(newStartTime, newEndTime);
                      return (
                        <div className="absolute left-0.5 right-0.5 rounded bg-green-200 border-2 border-green-500 border-dashed text-green-800 px-1 py-0.5 text-[10px] z-30 pointer-events-none opacity-80"
                          style={{ top: `${pos.top}px`, height: `${pos.height}px` }}>
                          <span className="font-medium">{newStartTime}-{newEndTime}</span>
                        </div>
                      );
                    })()}

                    {/* Drag preview */}
                    {!movingSlot && preview && preview.height > 4 && (() => {
                      if (dragMode === 'block') {
                        return (
                          <div className="absolute left-0.5 right-0.5 rounded bg-red-200 border border-red-400 border-dashed text-red-800 px-1 text-[10px] z-30 pointer-events-none opacity-80 flex items-center"
                            style={{ top: `${preview.top}px`, height: `${preview.height}px` }}>
                            <span className="font-medium truncate"><Ban className="w-2.5 h-2.5 inline mr-0.5" />{preview.startTime}-{preview.endTime}</span>
                          </div>
                        );
                      }
                      const blocks: Array<{ top: number; label: string }> = [];
                      const pStart = parse(preview.startTime, 'HH:mm', day);
                      const pEnd = parse(preview.endTime, 'HH:mm', day);
                      let cur = pStart;
                      while (cur < pEnd) {
                        const bEnd = addMinutes(cur, 30);
                        if (bEnd > pEnd) break;
                        const bHour = cur.getHours() + cur.getMinutes() / 60;
                        blocks.push({
                          top: (bHour - START_HOUR) * HOUR_HEIGHT,
                          label: `${format(cur, 'HH:mm')}-${format(bEnd, 'HH:mm')}`,
                        });
                        cur = bEnd;
                      }
                      return blocks.map((b, i) => (
                        <div key={i}
                          className="absolute left-0.5 right-0.5 rounded bg-blue-200 border border-blue-400 border-dashed text-blue-800 px-1 text-[10px] z-30 pointer-events-none opacity-80 flex items-center"
                          style={{ top: `${b.top}px`, height: `${HOUR_HEIGHT / 2}px` }}>
                          <span className="font-medium truncate">{b.label}</span>
                        </div>
                      ));
                    })()}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Event hover popup */}
        {hoveredEvent && (
          <div className="fixed z-[100] bg-white rounded-xl shadow-xl border border-gray-200 p-3 max-w-xs pointer-events-none"
            style={{
              left: `${Math.min(hoveredEvent.x + 12, window.innerWidth - 320)}px`,
              top: `${Math.min(hoveredEvent.y - 10, window.innerHeight - 160)}px`,
            }}>
            <div className="text-sm font-semibold text-gray-900 mb-1">{hoveredEvent.event.summary}</div>
            <div className="text-xs text-gray-600">
              {format(parseISO(hoveredEvent.event.start), 'M月d日(E) HH:mm', { locale: ja })}
              {' 〜 '}
              {format(parseISO(hoveredEvent.event.end), 'HH:mm')}
            </div>
            {hoveredEvent.event.allDay && (
              <div className="text-xs text-blue-600 mt-1">終日</div>
            )}
            {hoveredEvent.event.transparency === 'transparent' && (
              <div className="text-xs text-green-600 mt-1">✅ 予定なし（予約可能エリア）</div>
            )}
            {hoveredEvent.event.allowOverlap && (
              <div className="text-xs text-yellow-600 mt-1">重複許可</div>
            )}
            <div className="text-xs text-gray-400 mt-1">クリックで予定あり/なしを切替</div>
          </div>
        )}

        {/* Day Schedule Modal */}
        {showDayScheduleModal && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
            onClick={() => setShowDayScheduleModal(false)}>
            <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col"
              onClick={e => e.stopPropagation()}>
              <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between shrink-0">
                <h3 className="text-base font-semibold text-gray-900">希望する時間帯をドラッグで選択</h3>
                <button onClick={() => setShowDayScheduleModal(false)} className="p-1 hover:bg-gray-100 rounded-full">
                  <X className="w-4 h-4 text-gray-500" />
                </button>
              </div>
              <div className="flex-1 overflow-auto p-4" ref={dayScheduleGridRef}>
                {/* Day headers */}
                <div className="grid gap-1 mb-2" style={{ gridTemplateColumns: '40px repeat(7, 1fr)' }}>
                  <div />
                  {DAY_LABELS.map((label, idx) => {
                    const hasSchedule = (tempDaySchedules[String(idx)] || []).length > 0;
                    return (
                      <div key={idx} className="text-center cursor-pointer" onClick={() => toggleDayInModal(idx)}>
                        <div className={`w-8 h-8 mx-auto rounded-full flex items-center justify-center text-xs font-medium transition-colors ${
                          hasSchedule
                            ? idx === 0 ? 'bg-red-500 text-white' : idx === 6 ? 'bg-blue-500 text-white' : 'bg-blue-600 text-white'
                            : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
                        }`}>
                          {label}
                        </div>
                      </div>
                    );
                  })}
                </div>
                {/* Time grid */}
                <div className="grid gap-1" style={{ gridTemplateColumns: '40px repeat(7, 1fr)' }}>
                  {/* Hour labels */}
                  <div className="relative" style={{ height: `${DAY_SCHEDULE_HOURS * 2 * DAY_SCHEDULE_ROW_HEIGHT}px` }}>
                    {Array.from({ length: DAY_SCHEDULE_HOURS + 1 }, (_, i) => (
                      <div key={i} className="absolute right-1 text-[10px] text-gray-500"
                        style={{ top: `${i * 2 * DAY_SCHEDULE_ROW_HEIGHT - 6}px` }}>
                        {String(DAY_SCHEDULE_START_HOUR + i).padStart(2, '0')}:00
                      </div>
                    ))}
                  </div>
                  {/* Day columns */}
                  {DAY_LABELS.map((_, dayIdx) => {
                    const ranges = tempDaySchedules[String(dayIdx)] || [];
                    const isDragTarget = dayScheduleDragging && dayScheduleDragDay === dayIdx;
                    return (
                      <div key={dayIdx}
                        className="relative border border-gray-200 rounded bg-gray-50 select-none cursor-crosshair"
                        data-daycol={dayIdx}
                        style={{ height: `${DAY_SCHEDULE_HOURS * 2 * DAY_SCHEDULE_ROW_HEIGHT}px` }}
                        onMouseDown={e => handleDayScheduleDragStart(dayIdx, e)}
                        onMouseMove={e => { handleDayScheduleDragMove(e); handleDayScheduleResizeMove(e); }}
                        onMouseUp={() => { handleDayScheduleDragEnd(); handleDayScheduleResizeEnd(); }}
                        onMouseLeave={() => { if (dayScheduleDragging && dayScheduleDragDay === dayIdx) handleDayScheduleDragEnd(); if (dayScheduleResizing) handleDayScheduleResizeEnd(); }}>
                        {/* Hour grid lines */}
                        {Array.from({ length: DAY_SCHEDULE_HOURS }, (_, i) => (
                          <div key={i} className="absolute left-0 right-0 border-t border-gray-200"
                            style={{ top: `${i * 2 * DAY_SCHEDULE_ROW_HEIGHT}px` }} />
                        ))}
                        {/* Half-hour grid lines */}
                        {Array.from({ length: DAY_SCHEDULE_HOURS }, (_, i) => (
                          <div key={`half-${i}`} className="absolute left-0 right-0 border-t border-gray-100"
                            style={{ top: `${(i * 2 + 1) * DAY_SCHEDULE_ROW_HEIGHT}px` }} />
                        ))}
                        {/* Existing ranges */}
                        {ranges.map((range, rIdx) => {
                          const [sh, sm] = range.start.split(':').map(Number);
                          const [eh, em] = range.end.split(':').map(Number);
                          const startSlot = (sh - DAY_SCHEDULE_START_HOUR) * 2 + (sm >= 30 ? 1 : 0);
                          const endSlot = (eh - DAY_SCHEDULE_START_HOUR) * 2 + (em >= 30 ? 1 : 0);
                          const isBeingResized = dayScheduleResizing && dayScheduleResizeDay === dayIdx && dayScheduleResizeIdx === rIdx;
                          let displayTop = startSlot * DAY_SCHEDULE_ROW_HEIGHT;
                          let displayHeight = (endSlot - startSlot) * DAY_SCHEDULE_ROW_HEIGHT;
                          if (isBeingResized) {
                            const snappedY = Math.round(dayScheduleResizeY / DAY_SCHEDULE_ROW_HEIGHT) * DAY_SCHEDULE_ROW_HEIGHT;
                            if (dayScheduleResizeEdge === 'top') {
                              displayTop = Math.min(snappedY, displayTop + displayHeight - DAY_SCHEDULE_ROW_HEIGHT);
                              displayHeight = (startSlot * DAY_SCHEDULE_ROW_HEIGHT + (endSlot - startSlot) * DAY_SCHEDULE_ROW_HEIGHT) - displayTop;
                            } else {
                              displayHeight = Math.max(snappedY - displayTop, DAY_SCHEDULE_ROW_HEIGHT);
                            }
                          }
                          return (
                            <div key={rIdx}
                              className={`absolute left-0.5 right-0.5 rounded border-2 border-dashed border-blue-400 bg-blue-100/60 z-10 group/range ${isBeingResized ? 'shadow-md' : ''}`}
                              style={{ top: `${displayTop}px`, height: `${Math.max(displayHeight, DAY_SCHEDULE_ROW_HEIGHT)}px` }}
                              onMouseDown={e => e.stopPropagation()}>
                              {/* Top resize handle */}
                              <div className="absolute top-0 left-0 right-0 h-2 cursor-ns-resize z-20 group/rtop hover:bg-blue-400/30 rounded-t"
                                onMouseDown={e => handleDayScheduleResizeStart(dayIdx, rIdx, 'top', e)}>
                                <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-4 h-0.5 rounded-full bg-blue-400/0 group-hover/rtop:bg-blue-500/80" />
                              </div>
                              {/* Content */}
                              <div className="text-[9px] text-blue-700 px-0.5 truncate font-medium pointer-events-none select-none mt-1.5">
                                {isBeingResized ? `${dayScheduleYToTime(displayTop)}-${dayScheduleYToTime(displayTop + displayHeight)}` : `${range.start}-${range.end}`}
                              </div>
                              {/* Delete button */}
                              <button
                                className="absolute top-0.5 right-0.5 w-3 h-3 rounded-full bg-red-400 text-white flex items-center justify-center opacity-0 group-hover/range:opacity-100 transition-opacity z-20 hover:bg-red-500"
                                onClick={e => { e.stopPropagation(); removeDayScheduleRange(dayIdx, rIdx); }}
                                onMouseDown={e => e.stopPropagation()}>
                                <X className="w-2 h-2" />
                              </button>
                              {/* Bottom resize handle */}
                              <div className="absolute bottom-0 left-0 right-0 h-2 cursor-ns-resize z-20 group/rbottom hover:bg-blue-400/30 rounded-b"
                                onMouseDown={e => handleDayScheduleResizeStart(dayIdx, rIdx, 'bottom', e)}>
                                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-4 h-0.5 rounded-full bg-blue-400/0 group-hover/rbottom:bg-blue-500/80" />
                              </div>
                            </div>
                          );
                        })}
                        {/* Drag preview */}
                        {isDragTarget && dayScheduleDragging && (() => {
                          const startY = Math.min(dayScheduleDragStartY, dayScheduleDragEndY);
                          const endY = Math.max(dayScheduleDragStartY, dayScheduleDragEndY);
                          if (endY - startY < DAY_SCHEDULE_ROW_HEIGHT / 2) return null;
                          const snappedStartY = Math.round(startY / DAY_SCHEDULE_ROW_HEIGHT) * DAY_SCHEDULE_ROW_HEIGHT;
                          const snappedEndY = Math.round(endY / DAY_SCHEDULE_ROW_HEIGHT) * DAY_SCHEDULE_ROW_HEIGHT;
                          return (
                            <div className="absolute left-0.5 right-0.5 rounded border-2 border-blue-500 bg-blue-200/50 z-20 pointer-events-none"
                              style={{ top: `${snappedStartY}px`, height: `${Math.max(snappedEndY - snappedStartY, DAY_SCHEDULE_ROW_HEIGHT)}px` }}>
                              <div className="text-[9px] text-blue-700 px-0.5 font-medium">
                                {dayScheduleYToTime(startY)}-{dayScheduleYToTime(endY)}
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="px-5 py-4 border-t border-gray-200 flex justify-end gap-2 shrink-0">
                <button onClick={() => setShowDayScheduleModal(false)}
                  className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50">
                  キャンセル
                </button>
                <button onClick={confirmDaySchedule}
                  className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-1.5">
                  <Check className="w-3.5 h-3.5" /> 確定
                </button>
              </div>
            </div>
          </div>
        )}

        {/* New Email Template Modal */}
        {showNewTemplateModal && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowNewTemplateModal(false)}>
            <div className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
              <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
                <h3 className="text-base font-semibold text-gray-900">新規メールテンプレート作成</h3>
                <button onClick={() => setShowNewTemplateModal(false)} className="p-1 hover:bg-gray-100 rounded-full">
                  <X className="w-4 h-4 text-gray-500" />
                </button>
              </div>
              <div className="p-5 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">テンプレート名</label>
                  <input type="text" value={newTemplateName} onChange={e => setNewTemplateName(e.target.value)}
                    placeholder="例: 初回面談用" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">件名</label>
                  <input type="text" value={newTemplateSubject} onChange={e => setNewTemplateSubject(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">本文</label>
                  <textarea value={newTemplateBody} onChange={e => setNewTemplateBody(e.target.value)}
                    rows={10} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono" />
                </div>
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-xs font-medium text-gray-600 mb-1">使用可能な変数:</p>
                  <div className="text-xs text-gray-500 space-y-0.5">
                    <div><code className="bg-gray-200 px-1 rounded">{'{{guestName}}'}</code> ゲスト名</div>
                    <div><code className="bg-gray-200 px-1 rounded">{'{{eventTypeName}}'}</code> 予約タイプ名</div>
                    <div><code className="bg-gray-200 px-1 rounded">{'{{startTime}}'}</code> 開始日時</div>
                    <div><code className="bg-gray-200 px-1 rounded">{'{{duration}}'}</code> 所要時間（分）</div>
                    <div><code className="bg-gray-200 px-1 rounded">{'{{meetLink}}'}</code> Google Meetリンク</div>
                    <div><code className="bg-gray-200 px-1 rounded">{'{{manageUrl}}'}</code> 変更・キャンセルURL</div>
                  </div>
                </div>
              </div>
              <div className="px-5 py-4 border-t border-gray-200 flex justify-end gap-2">
                <button onClick={() => setShowNewTemplateModal(false)}
                  className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50">
                  キャンセル
                </button>
                <button onClick={handleSaveNewTemplate} disabled={savingTemplate || !newTemplateName.trim()}
                  className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1.5">
                  {savingTemplate ? '保存中...' : <><Check className="w-3.5 h-3.5" /> 作成して適用</>}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
