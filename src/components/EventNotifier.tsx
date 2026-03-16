'use client';

import { useEffect, useRef, useCallback } from 'react';

interface UpcomingEvent {
  id: string;
  summary: string;
  start: string;
  end: string;
  meetLink?: string;
  htmlLink?: string;
}

const NOTIFY_MINUTES_BEFORE = 10;
const CHECK_INTERVAL_MS = 30_000; // Check every 30 seconds

export default function EventNotifier() {
  const notifiedRef = useRef<Set<string>>(new Set());
  const permissionRef = useRef<NotificationPermission>('default');

  // Request notification permission on mount
  useEffect(() => {
    if (!('Notification' in window)) return;
    permissionRef.current = Notification.permission;
    if (Notification.permission === 'default') {
      Notification.requestPermission().then(perm => {
        permissionRef.current = perm;
      });
    }
  }, []);

  const checkUpcomingEvents = useCallback(async () => {
    if (permissionRef.current !== 'granted') return;

    try {
      const now = new Date();
      const soon = new Date(now.getTime() + NOTIFY_MINUTES_BEFORE * 60 * 1000);
      const timeMin = now.toISOString();
      const timeMax = soon.toISOString();

      const res = await fetch(`/api/calendar/events?timeMin=${timeMin}&timeMax=${timeMax}`);
      if (!res.ok) return;

      const data = await res.json();
      const events: UpcomingEvent[] = data.events || [];

      for (const event of events) {
        const eventStart = new Date(event.start);
        const minutesUntil = Math.round((eventStart.getTime() - now.getTime()) / 60000);
        const notifKey = `${event.id}-${event.start}`;

        // Only notify if within the window and not already notified
        if (minutesUntil >= 0 && minutesUntil <= NOTIFY_MINUTES_BEFORE && !notifiedRef.current.has(notifKey)) {
          notifiedRef.current.add(notifKey);

          const timeStr = eventStart.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
          const body = minutesUntil === 0
            ? `${event.summary} が今始まります`
            : `${event.summary} が${minutesUntil}分後に始まります（${timeStr}）`;

          const notification = new Notification('予定のリマインダー', {
            body,
            icon: '/icons/icon-192.png',
            badge: '/icons/icon-192.png',
            tag: notifKey,
            requireInteraction: true,
            data: { url: event.meetLink || event.htmlLink || '/calendar' },
          });

          notification.onclick = () => {
            window.focus();
            const url = notification.data?.url;
            if (url) {
              if (url.startsWith('http')) {
                window.open(url, '_blank');
              } else {
                window.location.href = url;
              }
            }
            notification.close();
          };
        }
      }

      // Clean up old notifications (older than 1 hour)
      const oneHourAgo = now.getTime() - 60 * 60 * 1000;
      for (const key of notifiedRef.current) {
        const dateStr = key.split('-').slice(-3).join('-'); // rough extraction
        try {
          const d = new Date(dateStr);
          if (d.getTime() < oneHourAgo) notifiedRef.current.delete(key);
        } catch {
          // ignore parse errors
        }
      }
    } catch (err) {
      console.log('EventNotifier check failed:', err);
    }
  }, []);

  useEffect(() => {
    // Initial check after a short delay
    const initialTimeout = setTimeout(checkUpcomingEvents, 5000);
    // Periodic checks
    const interval = setInterval(checkUpcomingEvents, CHECK_INTERVAL_MS);

    return () => {
      clearTimeout(initialTimeout);
      clearInterval(interval);
    };
  }, [checkUpcomingEvents]);

  return null;
}
