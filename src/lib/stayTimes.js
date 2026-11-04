// When a guest actually checked in and out (saved by the server as
// checkedInAt / checkedOutAt), formatted in Philippine time.

// After check-out, the reservation list keeps showing the times this long.
export const CHECKOUT_LABEL_MINUTES = 5;

// Firestore Timestamp, { seconds }, { _seconds }, ISO string or ms → ms (or null).
export function toMillis(value) {
  if (!value) return null;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (typeof value.seconds === 'number') return value.seconds * 1000;
  if (typeof value._seconds === 'number') return value._seconds * 1000;
  const ms = typeof value === 'number' ? value : new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
}

const manilaDay = ms => new Date(ms).toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });

// "2:05 PM" for today, "Nov 3, 2:05 PM" for another day.
export function formatStayTime(value, now = new Date()) {
  const ms = toMillis(value);
  if (ms === null) return '';
  const time = new Date(ms).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Manila' });
  if (manilaDay(ms) === manilaDay(now.getTime())) return time;
  const day = new Date(ms).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', timeZone: 'Asia/Manila' });
  return `${day}, ${time}`;
}

// Full date and time, for history and reports: "Nov 3, 2026, 2:05 PM".
export function formatStayDateTime(value) {
  const ms = toMillis(value);
  if (ms === null) return '';
  return new Date(ms).toLocaleString('en-PH', {
    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Manila',
  });
}

// Labels for the reservation list: "Checked in 2:05 PM" while the guest is
// in, plus "Checked out 11:02 AM" for a few minutes after they leave. Empty
// once that time has passed.
export function getLiveStayLabels(reservation = {}, now = new Date()) {
  const status = String(reservation.status || '');
  const inMs = toMillis(reservation.checkedInAt);
  const outMs = toMillis(reservation.checkedOutAt);
  if (status === 'checked-in') {
    return inMs === null ? [] : [{ type: 'in', text: `Checked in ${formatStayTime(inMs, now)}` }];
  }
  if (status === 'checked-out' && outMs !== null && now.getTime() - outMs <= CHECKOUT_LABEL_MINUTES * 60000) {
    return [
      ...(inMs === null ? [] : [{ type: 'in', text: `Checked in ${formatStayTime(inMs, now)}` }]),
      { type: 'out', text: `Checked out ${formatStayTime(outMs, now)}` },
    ];
  }
  return [];
}

// Full date and time with seconds and weekday: "Tue, Nov 4, 2026, 2:05:31 PM".
export function formatStayDateTimeLong(value) {
  const ms = toMillis(value);
  if (ms === null) return '';
  return new Date(ms).toLocaleString('en-PH', {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit', second: '2-digit', timeZone: 'Asia/Manila',
  });
}

// The booked moment in Philippine time, from a date key ("2026-11-04") and a
// time text such as "2:00 PM", "10:00 AM / 11:00 AM" (the first time counts)
// or "After 9:00 PM". Null when either part is missing.
export function scheduledMillis(dateKey, timeText) {
  const day = String(dateKey || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const match = String(timeText || '').match(/(\d{1,2}):(\d{2})\s*([AP])\.?\s*M/i);
  if (!match) return null;
  let hours = Number(match[1]) % 12;
  if (match[3].toUpperCase() === 'P') hours += 12;
  const ms = Date.parse(`${day}T${String(hours).padStart(2, '0')}:${match[2]}:00+08:00`);
  return Number.isFinite(ms) ? ms : null;
}

// "2 days 3 h 5 min", "45 min", "under 1 min".
export function formatDuration(ms) {
  const totalMinutes = Math.floor(Math.abs(ms) / 60000);
  if (totalMinutes < 1) return 'under 1 min';
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  return [
    days ? `${days} day${days === 1 ? '' : 's'}` : '',
    hours ? `${hours} h` : '',
    minutes ? `${minutes} min` : '',
  ].filter(Boolean).join(' ');
}

// How the actual time compares with the booked one. Within 5 minutes
// counts as on time.
export function describeTimingDifference(actualMs, scheduledMs) {
  if (actualMs === null || scheduledMs === null) return { text: '', tone: 'neutral' };
  const diff = actualMs - scheduledMs;
  if (Math.abs(diff) <= 5 * 60000) return { text: 'On time', tone: 'good' };
  return diff < 0
    ? { text: `${formatDuration(diff)} early`, tone: 'good' }
    : { text: `${formatDuration(diff)} late`, tone: 'late' };
}

// Everything History and Reports show about the real stay times.
export function getStayTimingDetails(reservation = {}) {
  const r = reservation;
  const actualIn = toMillis(r.checkedInAt);
  const actualOut = toMillis(r.checkedOutAt);
  const bookedIn = scheduledMillis(r.checkIn, r.checkInTime);
  const bookedOut = scheduledMillis(r.checkOut || r.checkIn, r.checkOutTime);
  return {
    checkIn: {
      actual: formatStayDateTimeLong(actualIn),
      booked: bookedIn === null ? '' : formatStayDateTime(bookedIn),
      ...describeTimingDifference(actualIn, bookedIn),
    },
    checkOut: {
      actual: formatStayDateTimeLong(actualOut),
      booked: bookedOut === null ? '' : formatStayDateTime(bookedOut),
      ...describeTimingDifference(actualOut, bookedOut),
    },
    duration: actualIn !== null && actualOut !== null && actualOut >= actualIn ? formatDuration(actualOut - actualIn) : '',
  };
}

// Check-in reminders for staff: pop up this many minutes before a guest's
// booked check-in time, and keep showing until this long after it.
export const CHECKIN_REMINDER_LEAD_MINUTES = 3;
export const CHECKIN_REMINDER_KEEP_MINUTES = 15;

const formatClock = ms => new Date(ms).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Manila' });

// Bookings whose check-in time is within the reminder window, soonest first.
export function getUpcomingCheckIns(reservations = [], now = Date.now()) {
  const nowMs = typeof now === 'number' ? now : now.getTime();
  return reservations
    .filter(r => ['pending', 'confirmed'].includes(String(r.status || '').toLowerCase()))
    .map(r => ({ r, at: scheduledMillis(r.checkIn, r.checkInTime) }))
    .filter(({ at }) => at !== null
      && nowMs >= at - CHECKIN_REMINDER_LEAD_MINUTES * 60000
      && nowMs <= at + CHECKIN_REMINDER_KEEP_MINUTES * 60000)
    .sort((a, b) => a.at - b.at)
    .map(({ r, at }) => {
      const minutes = Math.round((at - nowMs) / 60000);
      return {
        key: `${r.id}_${at}`,
        id: r.id,
        guest: r.guestName || r.contactPerson || r.companyName || 'Guest',
        place: r.cottageOnly ? 'Cottage only' : r.type === 'corporate' ? (r.packageName || 'Group') : (r.roomName || (r.roomNumber ? `Room ${r.roomNumber}` : 'Room')),
        timeText: formatClock(at),
        whenText: minutes > 0 ? `in ${minutes} min` : minutes === 0 ? 'now' : `${-minutes} min ago`,
      };
    });
}
