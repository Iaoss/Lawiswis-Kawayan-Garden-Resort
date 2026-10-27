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
