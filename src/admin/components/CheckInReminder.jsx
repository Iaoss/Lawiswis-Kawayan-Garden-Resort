import React, { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../../firebase/firebase';
import { getResortNow } from '../../lib/bookingPricing';
import { getUpcomingCheckIns } from '../../lib/stayTimes';

// Pop-up for admins and receptionists: a guest's check-in time is 3 minutes
// away (it stays until dismissed, or until 15 minutes after the time). Shown
// once per booking; dismissing is remembered on this device.

const SEEN_KEY = 'lkgr_checkin_reminders_seen';

function loadSeen() {
  try { return JSON.parse(localStorage.getItem(SEEN_KEY) || '[]'); } catch { return []; }
}
function saveSeen(ids) {
  try { localStorage.setItem(SEEN_KEY, JSON.stringify(ids.slice(-200))); } catch { /* storage unavailable */ }
}

function chime() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [0, 0.22].forEach(offset => {
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.value = 660;
      gain.gain.setValueAtTime(0.2, ctx.currentTime + offset);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + offset + 0.2);
      oscillator.connect(gain);
      gain.connect(ctx.destination);
      oscillator.start(ctx.currentTime + offset);
      oscillator.stop(ctx.currentTime + offset + 0.2);
    });
  } catch {
    // Browsers block sound until the page has been clicked once.
  }
}

export default function CheckInReminder({ dark, accent, prefix = '/admin', soundAlerts = true }) {
  const [today, setToday] = useState(() => getResortNow().dateKey);
  const [bookings, setBookings] = useState([]);
  const [now, setNow] = useState(() => Date.now());
  const [seen, setSeen] = useState(loadSeen);

  // Check every 10 seconds; also roll over to the next day at midnight.
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now());
      setToday(getResortNow().dateKey);
    }, 10000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => onSnapshot(
    query(collection(db, 'reservations'), where('checkIn', '==', today)),
    snapshot => setBookings(snapshot.docs.map(d => ({ id: d.id, ...d.data() }))),
    error => console.error('Check-in reminders could not load:', error),
  ), [today]);

  const due = useMemo(
    () => getUpcomingCheckIns(bookings, now).filter(item => !seen.includes(item.key)),
    [bookings, now, seen],
  );

  // Sound and a system notification once per new reminder.
  const [announced, setAnnounced] = useState(() => new Set());
  useEffect(() => {
    const fresh = due.filter(item => !announced.has(item.key));
    if (fresh.length === 0) return;
    setAnnounced(previous => new Set([...previous, ...fresh.map(item => item.key)]));
    if (soundAlerts) chime();
    try {
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted' && document.hidden) {
        fresh.forEach(item => new Notification('Guest arriving soon', { body: `${item.guest} · ${item.place} · check-in ${item.timeText}` }));
      }
    } catch { /* system notifications unavailable */ }
  }, [due, announced, soundAlerts]);

  const dismiss = keys => {
    setSeen(previous => {
      const next = Array.from(new Set([...previous, ...keys]));
      saveSeen(next);
      return next;
    });
  };

  if (due.length === 0) return null;

  const c = {
    accent: accent || '#9cb56f',
    panel: dark ? '#1c1c1c' : '#ffffff',
    border: dark ? '#2f2f2d' : '#e5e7eb',
    text: dark ? '#f0f0e8' : '#111827',
    muted: dark ? '#a3a39a' : '#6b7280',
    soft: dark ? '#23301f' : '#f3f9e8',
  };

  return (
    <div role="alertdialog" aria-live="assertive" aria-label="Upcoming check-in"
      style={{
        position: 'fixed', top: 72, right: 16, zIndex: 400, width: 'min(360px, calc(100vw - 32px))',
        background: c.panel, color: c.text, border: `1px solid ${c.border}`, borderLeft: `5px solid ${c.accent}`,
        borderRadius: 14, boxShadow: dark ? '0 18px 50px rgba(0,0,0,.55)' : '0 18px 50px rgba(0,0,0,.18)',
        fontFamily: "'Poppins', sans-serif", overflow: 'hidden',
      }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderBottom: `1px solid ${c.border}` }}>
        <span style={{ width: 34, height: 34, borderRadius: 10, background: c.soft, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
          <i className="ti ti-bell-ringing" aria-hidden="true" style={{ fontSize: 18, color: c.text }} />
        </span>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 14 }}>Check-in coming up</div>
          <div style={{ fontSize: 11, color: c.muted }}>Get the room and front desk ready.</div>
        </div>
        <button type="button" onClick={() => dismiss(due.map(item => item.key))} aria-label="Dismiss all"
          style={{ border: 0, background: 'transparent', color: c.muted, cursor: 'pointer', fontSize: 18 }}>
          <i className="ti ti-x" aria-hidden="true" />
        </button>
      </div>
      <div style={{ maxHeight: 320, overflowY: 'auto' }}>
        {due.map(item => (
          <div key={item.key} style={{ padding: '12px 14px', borderBottom: `1px solid ${c.border}` }}>
            <div style={{ fontWeight: 700, fontSize: 13 }}>{item.guest}</div>
            <div style={{ fontSize: 12, color: c.muted, marginTop: 2 }}>
              {item.place} · check-in {item.timeText} · <strong style={{ color: c.text }}>{item.whenText}</strong>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <button type="button"
                onClick={() => { dismiss([item.key]); window.location.href = `${prefix}/reservations?booking=${encodeURIComponent(item.id)}`; }}
                style={{ border: 0, background: c.accent, color: '#0a1a0a', borderRadius: 8, padding: '7px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                Open booking
              </button>
              <button type="button" onClick={() => dismiss([item.key])}
                style={{ border: `1px solid ${c.border}`, background: 'transparent', color: c.text, borderRadius: 8, padding: '7px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                Dismiss
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
