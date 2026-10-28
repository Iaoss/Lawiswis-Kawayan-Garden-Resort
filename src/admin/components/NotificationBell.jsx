import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Timestamp, collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../../firebase/firebase';
import NotificationButton from '../../components/ui/notification-button';
import { PulsingDot } from './TopbarControls';
import {
  ACTIVE_MODIFICATION_STATUSES,
  ACTIVE_REFUND_STATUSES,
  NEW_BOOKING_DAYS,
  buildBookingNotifications,
  formatNotificationTime,
} from '../lib/bookingNotifications';

// Bell in the staff top bar (admin and receptionist). Each notification card
// is one button: clicking anywhere on it opens that booking.

const READ_KEY = 'lkgr_read_notifications';

function loadReadIds() {
  try {
    const raw = localStorage.getItem(READ_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}
function saveReadIds(ids) {
  try { localStorage.setItem(READ_KEY, JSON.stringify(ids)); } catch { /* storage unavailable */ }
}

function playSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.value = 880;
    gain.gain.setValueAtTime(0.18, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.18);
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + 0.18);
  } catch {
    // Browsers block audio until the user has interacted with the page.
  }
}

// Live bookings that may need a notification. Several small queries instead
// of one filtered one, so nothing slips through: new bookings of any type
// and status, plus every open request.
function useNotificationReservations() {
  const [sources, setSources] = useState({});
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const since = Timestamp.fromMillis(Date.now() - NEW_BOOKING_DAYS * 86400000);
    const reservations = collection(db, 'reservations');
    const queries = {
      recent: query(reservations, where('createdAt', '>=', since)),
      cancellations: query(reservations, where('cancellationRequested', '==', true)),
      refunds: query(reservations, where('refundRequestStatus', 'in', ACTIVE_REFUND_STATUSES)),
      changes: query(reservations, where('modificationRequest.status', 'in', ACTIVE_MODIFICATION_STATUSES)),
    };
    const loaded = new Set();
    const stops = Object.entries(queries).map(([key, q]) => onSnapshot(q, snapshot => {
      setSources(current => ({ ...current, [key]: snapshot.docs.map(d => ({ id: d.id, ...d.data() })) }));
      loaded.add(key);
      if (loaded.size === Object.keys(queries).length) setReady(true);
    }, error => {
      console.error(`Notification feed "${key}" failed:`, error);
      loaded.add(key);
      if (loaded.size === Object.keys(queries).length) setReady(true);
    }));
    return () => stops.forEach(stop => stop());
  }, []);

  // One entry per booking (the same booking can match several queries).
  const reservations = useMemo(() => {
    const byId = new Map();
    Object.values(sources).flat().forEach(r => byId.set(r.id, r));
    return [...byId.values()];
  }, [sources]);

  return { reservations, ready };
}

const QUICK_LINKS = {
  '/admin': [
    { label: 'Bookings', icon: 'ti-calendar-event', path: '/admin/reservations', bg: 'rgba(200,240,110,0.1)', color: '#8fb83a' },
    { label: 'Payments', icon: 'ti-credit-card', path: '/admin/payments', bg: 'rgba(251,191,36,0.1)', color: '#d97706' },
    { label: 'Messages', icon: 'ti-message-circle-2', path: '/admin/messages', bg: 'rgba(167,139,250,0.1)', color: '#7c5ce0' },
  ],
  '/receptionist': [
    { label: 'Bookings', icon: 'ti-calendar-event', path: '/receptionist/reservations', bg: 'rgba(200,240,110,0.1)', color: '#8fb83a' },
    { label: 'Billing', icon: 'ti-receipt', path: '/receptionist/billing', bg: 'rgba(251,191,36,0.1)', color: '#d97706' },
    { label: 'Messages', icon: 'ti-message-circle-2', path: '/receptionist/messages', bg: 'rgba(167,139,250,0.1)', color: '#7c5ce0' },
  ],
};

export default function NotificationBell({ dark, accent, soundAlerts, prefix = '/admin' }) {
  const [open, setOpen] = useState(false);
  const [readIds, setReadIds] = useState(loadReadIds);
  const [now, setNow] = useState(() => Date.now());
  const { reservations, ready } = useNotificationReservations();
  const seededRef = useRef(false);
  const knownRef = useRef(new Set());
  const dotRef = useRef(new Set());

  // Keeps "5 min ago" labels and the 7-day window current.
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(timer);
  }, []);

  const notifications = useMemo(
    () => buildBookingNotifications(reservations, { prefix, now }),
    [reservations, prefix, now],
  );
  const unread = notifications.filter(n => !readIds.includes(n.id)).length;

  // Chime only for items that arrive after the first full load and haven't
  // been read. Nothing plays on page load or navigation.
  useEffect(() => {
    if (!ready) return;
    const ids = notifications.map(n => n.id);
    if (!seededRef.current) {
      seededRef.current = true;
      knownRef.current = new Set(ids);
      return;
    }
    const fresh = ids.filter(id => !knownRef.current.has(id) && !readIds.includes(id));
    ids.forEach(id => knownRef.current.add(id));
    if (fresh.length > 0 && soundAlerts) playSound();
  }, [ready, notifications, readIds, soundAlerts]);

  const markRead = ids => {
    setReadIds(previous => {
      const next = Array.from(new Set([...previous, ...ids])).slice(-500);
      saveReadIds(next);
      return next;
    });
  };

  const toggleOpen = () => {
    const next = !open;
    if (next) {
      // Keep the "new" dots while the panel is open, but clear the badge.
      dotRef.current = new Set(notifications.filter(n => !readIds.includes(n.id)).map(n => n.id));
      markRead(notifications.map(n => n.id));
    }
    setOpen(next);
  };

  const openItem = n => {
    markRead([n.id]);
    setOpen(false);
    window.location.href = n.bookingId ? `${n.path}?booking=${encodeURIComponent(n.bookingId)}` : n.path;
  };

  const c = {
    accent: accent || '#9cb56f',
    panel: dark ? '#1c1c1c' : '#ffffff',
    border: dark ? '#282827' : '#e5e7eb',
    text: dark ? '#e8e8d8' : '#111827',
    muted: dark ? '#8a8a7a' : '#6b7280',
    faint: dark ? '#5a5a4a' : '#9ca3af',
    rowA: dark ? '#1c1c1c' : '#ffffff',
    rowB: dark ? '#202020' : '#f9fafb',
    hover: dark ? '#262624' : '#f1f5ee',
    iconBg: dark ? '#282827' : '#f3f4f6',
    btnBg: dark ? '#282827' : '#f3f4f6',
    btnBorder: dark ? '#383837' : '#e5e7eb',
  };

  return (
    <div style={{ position: 'relative' }}>
      <NotificationButton
        onClick={toggleOpen}
        aria-label={unread > 0 ? `Alerts (${unread} unread)` : 'Alerts'}
        aria-expanded={open}
        title="Alerts"
        icon={<i className="ti ti-bell" style={{ fontSize: '18px', color: c.text, flexShrink: 0 }} />}
        style={{
          position: 'relative', width: '38px', height: '38px', padding: 0, flexShrink: 0, borderRadius: '10px',
          border: `1px solid ${c.btnBorder}`, background: c.btnBg, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
        }}
      >
        {unread > 0 && <PulsingDot color={accent} />}
      </NotificationButton>

      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 150 }} />
          <div role="dialog" aria-label="Notifications" style={{
            position: 'absolute', right: 0, top: '46px', width: 'min(360px, calc(100vw - 24px))',
            background: c.panel, borderRadius: '16px', border: `1px solid ${c.border}`,
            boxShadow: dark ? '0 20px 60px rgba(0,0,0,0.5)' : '0 20px 60px rgba(0,0,0,0.15)', zIndex: 200, overflow: 'hidden',
          }}>
            <div style={{ padding: '14px 16px', borderBottom: `1px solid ${c.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontWeight: 700, fontSize: '14px', color: c.text, fontFamily: "'Poppins', sans-serif", display: 'flex', alignItems: 'center', gap: '7px' }}>
                <i className="ti ti-bell" style={{ fontSize: '15px' }} />
                Notifications
                {notifications.length > 0 && <span style={{ fontSize: 11, fontWeight: 600, color: c.muted }}>({notifications.length})</span>}
              </div>
              <button type="button" onClick={() => setOpen(false)} style={{ background: 'none', border: 0, fontSize: '11px', color: c.accent, fontWeight: 600, cursor: 'pointer' }}>Close</button>
            </div>

            <div style={{ maxHeight: '420px', overflowY: 'auto' }}>
              {!ready ? (
                <div style={{ textAlign: 'center', padding: '32px', color: c.muted, fontSize: '12px' }}>Loading…</div>
              ) : notifications.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px', color: c.muted, fontSize: '12px' }}>
                  <i className="ti ti-bell-off" style={{ fontSize: '26px', display: 'block', marginBottom: '8px' }} />
                  Nothing new right now
                </div>
              ) : notifications.map((n, i) => {
                const isNew = dotRef.current.has(n.id);
                const rowBg = i % 2 === 0 ? c.rowA : c.rowB;
                return (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => openItem(n)}
                    aria-label={`${n.badge}: ${n.message}. Open booking.`}
                    onMouseEnter={event => { event.currentTarget.style.background = c.hover; }}
                    onMouseLeave={event => { event.currentTarget.style.background = rowBg; }}
                    style={{
                      width: '100%', textAlign: 'left', font: 'inherit', cursor: 'pointer',
                      padding: '12px 16px', border: 0, borderBottom: `1px solid ${c.border}`, background: rowBg,
                      display: 'flex', gap: '12px', alignItems: 'flex-start', transition: 'background .12s',
                    }}
                  >
                    <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: c.iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <i className={`ti ${n.icon}`} style={{ fontSize: '17px', color: c.text }} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', borderRadius: 999, border: `1px solid ${c.accent}55`, background: `${c.accent}22`, color: c.text, fontSize: 10, fontWeight: 700, letterSpacing: '.03em', padding: '2px 8px', marginBottom: 6 }}>{n.badge}</span>
                      <div style={{ fontSize: '12px', fontWeight: 600, color: c.text }}>{n.message}</div>
                      <div style={{ fontSize: '11px', color: c.muted, marginTop: '2px', overflowWrap: 'anywhere' }}>{n.details}</div>
                      <div style={{ fontSize: '10px', color: c.faint, marginTop: 6 }}>{formatNotificationTime(n.timeMs, now)}</div>
                    </div>
                    {isNew
                      ? <span aria-label="New" style={{ width: '8px', height: '8px', borderRadius: '50%', background: c.accent, flexShrink: 0, marginTop: '4px' }} />
                      : <i className="ti ti-chevron-right" aria-hidden="true" style={{ color: c.faint, fontSize: 14, marginTop: 10 }} />}
                  </button>
                );
              })}
            </div>

            <div style={{ padding: '12px 16px', borderTop: `1px solid ${c.border}`, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
              {(QUICK_LINKS[prefix] || QUICK_LINKS['/admin']).map(b => (
                <button key={b.label} type="button" onClick={() => { setOpen(false); window.location.href = b.path; }}
                  style={{ background: b.bg, color: b.color, border: `1px solid ${b.color}22`, borderRadius: '8px', padding: '10px 6px', fontSize: '10px', fontWeight: 600, cursor: 'pointer', fontFamily: "'Poppins', sans-serif", display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px' }}>
                  <i className={`ti ${b.icon}`} style={{ fontSize: '13px' }} />
                  {b.label}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
