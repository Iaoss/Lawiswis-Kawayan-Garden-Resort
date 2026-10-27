// Monthly dashboard numbers. Every count starts over on the 1st of each
// calendar month and is compared with the month before.

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Accepts a Firestore Timestamp, { seconds }, Date, or date string.
export function toDate(value) {
  if (!value) return null;
  if (typeof value.toDate === 'function') return value.toDate();
  if (typeof value.seconds === 'number') return new Date(value.seconds * 1000);
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    // Plain dates are local calendar days, not UTC midnight.
    const [y, m, d] = value.split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export const monthKey = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
const dayKey = date => `${monthKey(date)}-${String(date.getDate()).padStart(2, '0')}`;

const inMonth = (value, key) => {
  const date = toDate(value);
  return Boolean(date) && monthKey(date) === key;
};

const status = r => String(r.status || '').toLowerCase();
const ARRIVED = new Set(['checked-in', 'checked-out']);
const paymentDate = p => p.paidAt || p.paymentDate || p.createdAt || p.date;
const bookedDate = r => r.createdAt || r.date || r.timestamp;

function totalsFor(key, reservations, payments) {
  return {
    bookings: reservations.filter(r => inMonth(bookedDate(r), key)).length,
    checkIns: reservations.filter(r => ARRIVED.has(status(r)) && inMonth(r.checkIn, key)).length,
    checkOuts: reservations.filter(r => status(r) === 'checked-out' && inMonth(r.checkOut, key)).length,
    revenue: payments
      .filter(p => inMonth(paymentDate(p), key))
      .reduce((sum, p) => sum + (Number(p.amount) || 0), 0),
  };
}

// Percentage change from last month, e.g. { label: '+12.5%', up: true }.
export function getTrend(current, previous) {
  if (!previous) {
    return current > 0 ? { label: 'New', up: true } : { label: '0%', up: true };
  }
  const change = ((current - previous) / previous) * 100;
  const rounded = Math.round(change * 100) / 100;
  return { label: `${rounded > 0 ? '+' : ''}${rounded.toFixed(2)}%`, up: rounded >= 0 };
}

export function computeMonthlyStats(reservations = [], payments = [], now = new Date()) {
  const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const current = totalsFor(monthKey(thisMonth), reservations, payments);
  const previous = totalsFor(monthKey(lastMonth), reservations, payments);
  const trends = Object.fromEntries(Object.keys(current).map(k => [k, getTrend(current[k], previous[k])]));
  return {
    monthLabel: thisMonth.toLocaleString('default', { month: 'long', year: 'numeric' }),
    current,
    previous,
    trends,
  };
}

// Revenue per month for the last `months` months, oldest first.
export function revenueByMonth(payments = [], now = new Date(), months = 6) {
  return Array.from({ length: months }, (_, i) => {
    const date = new Date(now.getFullYear(), now.getMonth() - (months - 1 - i), 1);
    const key = monthKey(date);
    const v = payments
      .filter(p => inMonth(paymentDate(p), key))
      .reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
    return { m: MONTH_NAMES[date.getMonth()], v };
  });
}

// Bookings made on each of the last `days` days, split into booked/cancelled.
export function reservationsByDay(reservations = [], now = new Date(), days = 7) {
  return Array.from({ length: days }, (_, i) => {
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (days - 1 - i));
    const key = dayKey(date);
    const made = reservations.filter(r => {
      const d = toDate(bookedDate(r));
      return d && dayKey(d) === key;
    });
    const cancelled = made.filter(r => status(r) === 'cancelled').length;
    return { d: `${date.getDate()} ${MONTH_NAMES[date.getMonth()]}`, booked: made.length - cancelled, cancelled };
  });
}

// Bookings made in each of the last `months` months, split into booked/cancelled.
export function reservationsByMonth(reservations = [], now = new Date(), months = 6) {
  return Array.from({ length: months }, (_, i) => {
    const date = new Date(now.getFullYear(), now.getMonth() - (months - 1 - i), 1);
    const key = monthKey(date);
    const made = reservations.filter(r => inMonth(bookedDate(r), key));
    const cancelled = made.filter(r => status(r) === 'cancelled').length;
    return { d: `${MONTH_NAMES[date.getMonth()]} ${String(date.getFullYear()).slice(2)}`, booked: made.length - cancelled, cancelled };
  });
}

export const RESERVATION_CHART_RANGES = [
  { id: '7d', label: 'Last 7 Days' },
  { id: '14d', label: 'Last 14 Days' },
  { id: '30d', label: 'Last 30 Days' },
  { id: 'month', label: 'This Month' },
  { id: '6m', label: 'Last 6 Months' },
  { id: '12m', label: 'Last 12 Months' },
];

// Chart rows for the Reservations chart filter.
export function reservationsChartData(reservations = [], now = new Date(), rangeId = '7d') {
  switch (rangeId) {
    case '14d': return reservationsByDay(reservations, now, 14);
    case '30d': return reservationsByDay(reservations, now, 30);
    case 'month': return reservationsByDay(reservations, now, now.getDate());
    case '6m': return reservationsByMonth(reservations, now, 6);
    case '12m': return reservationsByMonth(reservations, now, 12);
    default: return reservationsByDay(reservations, now, 7);
  }
}

// ── Revenue chart filter ──────────────────────────────────────────
export const REVENUE_CHART_RANGES = [
  { id: '3m', label: 'Last 3 Months' },
  { id: '6m', label: 'Last 6 Months' },
  { id: '12m', label: 'Last 12 Months' },
  { id: 'year', label: 'This Year' },
];

export function revenueChartData(payments = [], now = new Date(), rangeId = '6m') {
  const months = { '3m': 3, '12m': 12, year: now.getMonth() + 1 }[rangeId] || 6;
  return revenueByMonth(payments, now, months);
}

// ── Booking by platform (where the booking came from) ─────────────
export const PLATFORM_RANGES = [
  { id: 'month', label: 'This Month' },
  { id: '30d', label: 'Last 30 Days' },
  { id: '6m', label: 'Last 6 Months' },
  { id: 'all', label: 'All Time' },
];

const PLATFORMS = [
  { id: 'online', name: 'Website (online)', color: '#89D7B7' },
  { id: 'walk-in', name: 'Walk-in', color: '#9cb56f' },
  { id: 'corporate', name: 'Corporate / group', color: '#60a5fa' },
  { id: 'other', name: 'Other', color: '#a78bfa' },
];

const platformOf = r => {
  const type = String(r.type || '').toLowerCase().replace(/[\s_]/g, '-');
  if (type === 'walkin') return 'walk-in';
  return PLATFORMS.some(p => p.id === type) ? type : 'other';
};

// Count and share of bookings per platform, by booking date. Cancelled
// bookings are left out. Platforms with no bookings are dropped.
export function bookingsByPlatform(reservations = [], now = new Date(), rangeId = 'month') {
  const start = {
    month: new Date(now.getFullYear(), now.getMonth(), 1),
    '30d': new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29),
    '6m': new Date(now.getFullYear(), now.getMonth() - 5, 1),
  }[rangeId] || null;
  const list = reservations.filter(r => {
    if (status(r) === 'cancelled') return false;
    if (!start) return true;
    const d = toDate(bookedDate(r));
    return Boolean(d) && d >= start && d <= now;
  });
  const total = list.length;
  return PLATFORMS
    .map(p => {
      const count = list.filter(r => platformOf(r) === p.id).length;
      return { name: p.name, color: p.color, count, value: total ? Math.round((count / total) * 100) : 0 };
    })
    .filter(p => p.count > 0);
}

// ── Room availability on a chosen date ───────────────────────────
const NOT_READY = new Set(['maintenance', 'cleaning', 'unavailable', 'out-of-service']);
const INACTIVE = new Set(['cancelled', 'checked-out', 'rejected', 'refunded']);
const dateOnly = value => {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  const d = toDate(value);
  return d ? dayKey(d) : '';
};

// For each room on `dateKey` (YYYY-MM-DD): occupied (guest checked in),
// reserved (booked but not checked in), not ready (maintenance/cleaning),
// or available. A single-day booking (same check-in and check-out date)
// counts on that date.
export function roomAvailabilityOn(rooms = [], reservations = [], dateKeyValue) {
  const counts = { occupied: 0, reserved: 0, available: 0, notReady: 0, total: rooms.length };
  rooms.forEach(room => {
    if (NOT_READY.has(String(room.status || '').toLowerCase())) { counts.notReady += 1; return; }
    const stays = reservations.filter(r => {
      if (r.roomId !== room.id || INACTIVE.has(status(r))) return false;
      const checkIn = dateOnly(r.checkIn);
      const checkOut = dateOnly(r.checkOut);
      if (!checkIn || !checkOut) return false;
      return checkIn === checkOut ? checkIn === dateKeyValue : checkIn <= dateKeyValue && dateKeyValue < checkOut;
    });
    if (stays.some(r => status(r) === 'checked-in')) counts.occupied += 1;
    else if (stays.length) counts.reserved += 1;
    else counts.available += 1;
  });
  return counts;
}
