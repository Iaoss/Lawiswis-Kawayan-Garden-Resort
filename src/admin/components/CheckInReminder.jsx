import { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../../firebase/firebase';
import { getResortNow } from '../../lib/bookingPricing';
import { getUpcomingCheckIns } from '../../lib/stayTimes';
import { pushToast } from '../lib/staffToasts';
import { staffApi } from '../lib/staffApi';
import { isReadyToCheckIn } from '../../lib/reservationStatus';

// Reminder for admins and receptionists: a guest's check-in time is 3
// minutes away (offered until 15 minutes after the time). Shown once per
// booking as a pop-up alert; dismissing is remembered on this device.

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

export default function CheckInReminder({ prefix = '/admin', soundAlerts = true }) {
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

  // Each reminder pops up once as a yellow alert (StaffToaster) that stays
  // until dismissed, with a chime and a system notification.
  useEffect(() => {
    due.forEach(item => {
      const booking = bookings.find(b => b.id === item.id);
      const ready = isReadyToCheckIn(booking);
      const key = pushToast({
        id: `checkin-soon_${item.key}`,
        variant: 'warning',
        title: `Check-in ${item.whenText}: ${item.guest}`,
        description: ready
          ? `${item.place} · booked for ${item.timeText}. Paid in full, ready to check in when they arrive.`
          : `${item.place} · booked for ${item.timeText}. Get the room and front desk ready.`,
        // Paid in full: check the guest in from here once they arrive.
        primary: ready ? {
          label: 'Check in',
          run: async () => {
            await staffApi('reservation-status', { action: 'set-status', reservationId: item.id, status: 'checked-in' });
            pushToast({ variant: 'success', title: `${item.guest} is checked in`, description: `${item.place} is now occupied.` });
          },
        } : null,
        path: `${prefix}/reservations?booking=${encodeURIComponent(item.id)}`,
        actionLabel: 'Open booking',
        sticky: true,
        onDismiss: () => setSeen(previous => {
          const next = Array.from(new Set([...previous, item.key]));
          saveSeen(next);
          return next;
        }),
      });
      if (!key) return;
      if (soundAlerts) chime();
      try {
        if (typeof Notification !== 'undefined' && Notification.permission === 'granted' && document.hidden) {
          new Notification('Guest arriving soon', { body: `${item.guest} · ${item.place} · check-in ${item.timeText}` });
        }
      } catch { /* system notifications unavailable */ }
    });
  }, [due, bookings, prefix, soundAlerts]);

  return null;
}
