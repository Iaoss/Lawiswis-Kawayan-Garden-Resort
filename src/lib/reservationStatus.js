// Shared reservation status, overstay and analytics helpers.
// Used by the staff pages and by the server (apiHandlers/reservation-status.js),
// so both sides agree on what counts as an overstay.
//
// All times are Philippine time (UTC+8, no daylight saving), because the
// server runs in UTC and staff browsers may not.

export const RESERVATION_STATUSES = ['pending', 'confirmed', 'checked-in', 'checked-out', 'cancelled'];

// A booking moves through these in order, one step at a time.
export const STATUS_FLOW = ['pending', 'confirmed', 'checked-in', 'checked-out'];
const STATUS_LABELS = { pending: 'Pending', confirmed: 'Confirmed', 'checked-in': 'Checked in', 'checked-out': 'Checked out', cancelled: 'Cancelled' };

// Returns why a status change isn't allowed, or '' when it is.
// Rules (enforced on the server and shown in the stepper):
//   - forward or back one step at a time, no skipping
//     (e.g. Pending → Checked out must go through Confirmed and Checked in);
//   - any booking can be cancelled except a finished (checked-out) stay;
//   - a cancelled booking reopens as Pending.
// Unrecognised old statuses can move anywhere, so they can be fixed.
export function getStatusTransitionError(from, to) {
  if (from === to) return '';
  if (!RESERVATION_STATUSES.includes(to)) return 'Choose a valid reservation status.';
  if (to === 'cancelled') return from === 'checked-out' ? 'A finished stay can’t be cancelled.' : '';
  if (from === 'cancelled') return to === 'pending' ? '' : 'Reopen a cancelled booking as Pending first.';
  const fromIndex = STATUS_FLOW.indexOf(from);
  const toIndex = STATUS_FLOW.indexOf(to);
  if (fromIndex === -1 || Math.abs(toIndex - fromIndex) === 1) return '';
  return toIndex > fromIndex
    ? `Steps can't be skipped. Move this booking to ${STATUS_LABELS[STATUS_FLOW[fromIndex + 1]]} first.`
    : `Move back one step at a time. Go to ${STATUS_LABELS[STATUS_FLOW[fromIndex - 1]]} first.`;
}

// Minutes after the scheduled check-out before a guest counts as overstaying.
export const OVERSTAY_GRACE_MINUTES = 0;
// Used when a reservation has no check-out time saved.
export const DEFAULT_CHECKOUT_TIME = '12:00 PM';
// Largest single late check-out charge staff can add, as a typo guard.
export const MAX_LATE_FEE = 100000;

const MANILA_OFFSET_HOURS = 8;
const DAY_MS = 86400000;

// Reads the first "h:mm AM/PM" in a saved time such as "10:00 PM / 12:00 MN".
function parseClock(value, fallback = DEFAULT_CHECKOUT_TIME) {
  const pattern = /(\d{1,2}):(\d{2})\s*(AM|PM)/i;
  const match = pattern.exec(value || '') || pattern.exec(fallback);
  let hours = Number(match[1]) % 12;
  if (match[3].toUpperCase() === 'PM') hours += 12;
  return { hours, minutes: Number(match[2]) };
}

// Scheduled check-out moment (ms since epoch), or null if the date is missing.
export function getScheduledCheckOutMs(reservation) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(reservation?.checkOut || '');
  if (!match) return null;
  const { hours, minutes } = parseClock(reservation.checkOutTime);
  return Date.UTC(+match[1], +match[2] - 1, +match[3], hours - MANILA_OFFSET_HOURS, minutes);
}

export function formatDuration(ms) {
  const totalMinutes = Math.floor(ms / 60000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  if (days) return `${days}d ${hours}h`;
  if (hours) return `${hours}h ${totalMinutes % 60}m`;
  return `${totalMinutes}m`;
}

// A checked-in guest past their scheduled check-out. Returns null otherwise.
export function getOverstay(reservation, now = new Date()) {
  if (reservation?.status !== 'checked-in') return null;
  const end = getScheduledCheckOutMs(reservation);
  if (end === null) return null;
  const ms = now.getTime() - end - OVERSTAY_GRACE_MINUTES * 60000;
  return ms > 0 ? { ms, minutes: Math.floor(ms / 60000), label: formatDuration(ms) } : null;
}

export function getLateFeeTotal(reservation) {
  return Number(reservation?.lateCheckoutChargeTotal || 0);
}

// True for stays that ran past check-out: flagged by staff, checked out late,
// or charged a late check-out fee. Older bookings have none of these fields.
export function hadOverstay(reservation) {
  return Boolean(reservation?.overstay?.flaggedAt)
    || Number(reservation?.overstayMinutes || 0) > 0
    || getLateFeeTotal(reservation) > 0;
}

export function getOutstandingBalance(reservation) {
  return Number(reservation?.totalAmount || 0)
    + Number(reservation?.extraCharges || 0)
    - Number(reservation?.amountPaid || 0);
}

export function hasOutstandingBalance(reservation) {
  return Math.round(getOutstandingBalance(reservation) * 100) > 0;
}

// ── Analytics ──────────────────────────────────────────────────────────────

// Today's date in Philippine time, as YYYY-MM-DD.
export function manilaDateKey(now = new Date()) {
  return new Date(now.getTime() + MANILA_OFFSET_HOURS * 3600000).toISOString().slice(0, 10);
}

function shiftDateKey(dateKey, days) {
  const date = new Date(`${dateKey}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

const daysBetween = (fromKey, toKey) =>
  Math.round((new Date(`${toKey}T00:00:00Z`) - new Date(`${fromKey}T00:00:00Z`)) / DAY_MS) + 1;

export const ANALYTICS_PERIODS = [
  { id: '30', label: 'Last 30 days', days: 30 },
  { id: '90', label: 'Last 90 days', days: 90 },
  { id: '365', label: 'Last 12 months', days: 365 },
  { id: 'all', label: 'All time', days: null },
];

const checkInKey = reservation => (typeof reservation?.checkIn === 'string' ? reservation.checkIn.slice(0, 10) : '');
const checkOutKey = reservation => (typeof reservation?.checkOut === 'string' ? reservation.checkOut.slice(0, 10) : '');
const isCounted = reservation => reservation?.status !== 'cancelled' && /^\d{4}-\d{2}-\d{2}$/.test(checkInKey(reservation));

// Date range (inclusive) for a period, ending today. "All time" starts at the
// earliest check-in on record.
export function getPeriodRange(reservations, periodId, now = new Date()) {
  const to = manilaDateKey(now);
  const period = ANALYTICS_PERIODS.find(item => item.id === periodId) || ANALYTICS_PERIODS[0];
  if (period.days) return { from: shiftDateKey(to, -(period.days - 1)), to };
  const earliest = reservations.filter(isCounted).map(checkInKey).filter(key => key <= to).sort()[0];
  return { from: earliest || to, to };
}

// Average reservations per day / week / month, by check-in date, within the
// period. Cancelled bookings are not counted.
export function getReservationAverages(reservations, range) {
  const count = reservations.filter(r => isCounted(r) && checkInKey(r) >= range.from && checkInKey(r) <= range.to).length;
  const days = Math.max(1, daysBetween(range.from, range.to));
  return {
    count,
    days,
    perDay: count / days,
    perWeek: count / (days / 7),
    perMonth: count / (days / (365.25 / 12)),
  };
}

// Average reservations per month in each quarter, across every year on record.
export function getQuarterlyBreakdown(reservations, now = new Date()) {
  const today = manilaDateKey(now);
  const counted = reservations.filter(r => isCounted(r) && checkInKey(r) <= today);
  const quarters = [
    { id: 'Q1', label: 'Jan–Mar', months: [1, 2, 3] },
    { id: 'Q2', label: 'Apr–Jun', months: [4, 5, 6] },
    { id: 'Q3', label: 'Jul–Sep', months: [7, 8, 9] },
    { id: 'Q4', label: 'Oct–Dec', months: [10, 11, 12] },
  ];
  // Months of history each quarter covers, so a quarter seen once isn't
  // compared against one seen three times.
  const monthsSeen = new Set();
  if (counted.length) {
    const first = counted.map(checkInKey).sort()[0];
    let year = Number(first.slice(0, 4));
    let month = Number(first.slice(5, 7));
    const endYear = Number(today.slice(0, 4));
    const endMonth = Number(today.slice(5, 7));
    while (year < endYear || (year === endYear && month <= endMonth)) {
      monthsSeen.add(`${year}-${month}`);
      month += 1;
      if (month > 12) { month = 1; year += 1; }
    }
  }
  const rows = quarters.map(quarter => {
    const count = counted.filter(r => quarter.months.includes(Number(checkInKey(r).slice(5, 7)))).length;
    const months = [...monthsSeen].filter(key => quarter.months.includes(Number(key.split('-')[1]))).length;
    return { ...quarter, count, months, perMonth: months ? count / months : 0 };
  });
  const busiest = Math.max(...rows.map(row => row.perMonth));
  return rows.map(row => ({ ...row, peak: busiest > 0 && row.perMonth === busiest }));
}

// Overstay figures: guests overstaying right now, plus stays in the period
// (by check-out date) that overstayed, and late check-out charges added.
export function getOverstayStats(reservations, range, now = new Date()) {
  const active = reservations.filter(r => getOverstay(r, now));
  const inPeriod = reservations.filter(r => {
    const key = checkOutKey(r);
    return r.status !== 'cancelled' && key >= range.from && key <= range.to;
  });
  const completed = inPeriod.filter(r => r.status === 'checked-out' || hadOverstay(r));
  const overstayed = inPeriod.filter(hadOverstay);
  return {
    activeCount: active.length,
    historicalCount: overstayed.length,
    rate: completed.length ? overstayed.length / completed.length : 0,
    lateFeeTotal: inPeriod.reduce((total, r) => total + getLateFeeTotal(r), 0),
  };
}
