// Numbers for the admin and receptionist dashboards, worked out from the
// real reservations, payments and feedback (no sample data). Dates are
// grouped by Philippine time.
import { manilaDateKey } from './reservationStatus';
import { SERVICES } from './services';

export function toMillis(value) {
  if (!value) return 0;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (typeof value.seconds === 'number') return value.seconds * 1000;
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
}

const money = value => Math.round(Number(value || 0) * 100) / 100;
const dayKeyOf = ms => (ms ? manilaDateKey(new Date(ms)) : '');
const paidMs = p => toMillis(p.paidAt || p.createdAt || p.paymentDate || p.date || p.timestamp);

function shiftDays(dateKey, days) {
  const date = new Date(`${dateKey}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

// Money collected per month for the last `months` months (this month last).
export function getMonthlyRevenue(payments, now = new Date(), months = 6) {
  const [year, month] = manilaDateKey(now).split('-').map(Number);
  const buckets = [];
  for (let back = months - 1; back >= 0; back -= 1) {
    const date = new Date(Date.UTC(year, month - 1 - back, 1));
    buckets.push({
      key: date.toISOString().slice(0, 7),
      m: date.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' }),
      v: 0,
    });
  }
  payments.forEach(payment => {
    if (payment.status && ['failed', 'refunded', 'void'].includes(String(payment.status).toLowerCase())) return;
    const bucket = buckets.find(item => item.key === dayKeyOf(paidMs(payment)).slice(0, 7));
    if (bucket) bucket.v = money(bucket.v + Number(payment.amount || 0));
  });
  return buckets;
}

// When a booking was cancelled: the recorded time, or its last status change.
const cancelledMs = r => toMillis(r.cancelledAt) || (r.status === 'cancelled' ? toMillis(r.statusUpdatedAt) : 0);

// New bookings and cancellations per day for the last `days` days.
export function getDailyReservations(reservations, now = new Date(), days = 7) {
  const today = manilaDateKey(now);
  const rows = [];
  for (let back = days - 1; back >= 0; back -= 1) {
    const key = shiftDays(today, -back);
    const date = new Date(`${key}T00:00:00Z`);
    rows.push({ key, d: date.toLocaleString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }), booked: 0, cancelled: 0 });
  }
  reservations.forEach(r => {
    const booked = rows.find(row => row.key === dayKeyOf(toMillis(r.createdAt)));
    if (booked) booked.booked += 1;
    const cancelled = r.status === 'cancelled' ? rows.find(row => row.key === dayKeyOf(cancelledMs(r))) : null;
    if (cancelled) cancelled.cancelled += 1;
  });
  return rows;
}

export const REVENUE_SOURCES = [
  { id: 'rooms', label: 'Rooms & packages', color: '#89D7B7' },
  { id: 'cottages', label: 'Cottages', color: '#9cb56f' },
  ...SERVICES.map((service, index) => ({ id: service.id, label: service.label, color: ['#60a5fa', '#f472b6', '#a78bfa'][index % 3] })),
  { id: 'charges', label: 'Extra & late charges', color: '#fb923c' },
  { id: 'cancellationFees', label: 'Cancellation fees', color: '#94a3b8' },
];

const checkInKey = r => (typeof r.checkIn === 'string' ? r.checkIn.slice(0, 10) : '');

// Billed amounts split by where they came from: room bookings, cottages,
// each add-on service, other extra charges (incl. late check-out), and
// cancellation fees kept. Bookings are counted by check-in date within the
// range ({ from, to } date keys; omit for all time).
export function getRevenueBySource(reservations, range = null) {
  const totals = Object.fromEntries(REVENUE_SOURCES.map(source => [source.id, 0]));
  reservations.forEach(r => {
    const key = checkInKey(r);
    if (range && (!key || key < range.from || key > range.to)) return;
    if (r.status === 'cancelled') {
      totals.cancellationFees += Number(r.cancellationFee || 0);
      return;
    }
    const cottage = Number(r.cottageFee || 0);
    totals.cottages += cottage;
    totals.rooms += Math.max(0, Number(r.totalAmount || 0) - cottage);
    let services = 0;
    (Array.isArray(r.extraChargeItems) ? r.extraChargeItems : []).forEach(item => {
      if (item?.serviceId && item.serviceId in totals) {
        totals[item.serviceId] += Number(item.amount || 0);
        services += Number(item.amount || 0);
      }
    });
    totals.charges += Math.max(0, Number(r.extraCharges || 0) - services);
  });
  const rows = REVENUE_SOURCES.map(source => ({ ...source, value: money(totals[source.id]) }));
  const total = money(rows.reduce((sum, row) => sum + row.value, 0));
  return {
    total,
    rows: rows.map(row => ({ ...row, share: total > 0 ? row.value / total : 0 })),
  };
}

export const FEEDBACK_CATEGORIES = [
  { key: 'ambience', label: 'Garden & ambience' },
  { key: 'rooms', label: 'Rooms & cleanliness' },
  { key: 'staff', label: 'Staff service' },
  { key: 'facilities', label: 'Pool & facilities' },
];

const overallOf = f => Number(f.rating) || 0;

export function ratingWord(average) {
  if (!average) return 'No ratings yet';
  if (average >= 4.5) return 'Excellent';
  if (average >= 4) return 'Very good';
  if (average >= 3) return 'Good';
  return 'Needs attention';
}

// Average ratings and counts from guest feedback. With `sinceMs`, only
// feedback submitted after that time is counted.
export function getFeedbackSummary(feedback, { sinceMs = 0 } = {}) {
  const list = feedback.filter(f => !sinceMs || toMillis(f.createdAt || f.submittedAt) >= sinceMs);
  const rated = list.filter(f => overallOf(f) > 0);
  const average = rated.length ? rated.reduce((sum, f) => sum + overallOf(f), 0) / rated.length : 0;
  const categories = FEEDBACK_CATEGORIES.map(category => {
    const values = list.map(f => Number(f.ratings?.[category.key]) || 0).filter(value => value > 0);
    return { ...category, count: values.length, average: values.length ? values.reduce((s, v) => s + v, 0) / values.length : 0 };
  });
  const latestComments = [...list]
    .filter(f => typeof f.comment === 'string' && f.comment.trim())
    .sort((a, b) => toMillis(b.createdAt || b.submittedAt) - toMillis(a.createdAt || a.submittedAt))
    .slice(0, 3);
  return {
    count: list.length,
    ratedCount: rated.length,
    average: Math.round(average * 10) / 10,
    word: ratingWord(average),
    positive: rated.filter(f => overallOf(f) >= 4).length,
    negative: rated.filter(f => overallOf(f) <= 2).length,
    unread: list.filter(f => !f.read).length,
    categories,
    latestComments,
  };
}
