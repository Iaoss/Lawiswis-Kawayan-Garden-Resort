import { computeMonthlyStats, getTrend, revenueByMonth, reservationsByDay } from './monthlyStats';

const now = new Date(2026, 9, 27); // 27 Oct 2026
const ts = (y, m, d) => ({ seconds: new Date(y, m, d, 12).getTime() / 1000 });

const reservations = [
  { createdAt: ts(2026, 9, 2), checkIn: '2026-10-05', checkOut: '2026-10-06', status: 'checked-out' },
  { createdAt: ts(2026, 9, 26), checkIn: '2026-11-01', checkOut: '2026-11-02', status: 'cancelled' },
  { createdAt: ts(2026, 8, 15), checkIn: '2026-09-20', checkOut: '2026-10-01', status: 'checked-out' },
  { createdAt: ts(2026, 8, 20), checkIn: '2026-09-25', checkOut: '2026-09-26', status: 'checked-in' },
];
const payments = [
  { amount: 3000, createdAt: ts(2026, 9, 3) },
  { amount: 1000, paidAt: ts(2026, 8, 10) },
  { amount: 500, createdAt: ts(2025, 9, 3) }, // same month, last year
];

test('counts only the current calendar month', () => {
  const { current, previous } = computeMonthlyStats(reservations, payments, now);
  expect(current).toEqual({ bookings: 2, checkIns: 1, checkOuts: 2, revenue: 3000 });
  expect(previous).toEqual({ bookings: 2, checkIns: 2, checkOuts: 0, revenue: 1000 });
});

test('starts over on the 1st of the next month', () => {
  const { current } = computeMonthlyStats(reservations, payments, new Date(2026, 10, 1));
  expect(current).toEqual({ bookings: 0, checkIns: 0, checkOuts: 0, revenue: 0 });
});

test('trend compares with last month', () => {
  expect(getTrend(3000, 1000)).toEqual({ label: '+200.00%', up: true });
  expect(getTrend(1, 2)).toEqual({ label: '-50.00%', up: false });
  expect(getTrend(5, 0)).toEqual({ label: 'New', up: true });
  expect(getTrend(0, 0)).toEqual({ label: '0%', up: true });
});

test('charts use real data', () => {
  const rev = revenueByMonth(payments, now, 6);
  expect(rev.map(r => r.m)).toEqual(['May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct']);
  expect(rev[5].v).toBe(3000);
  const days = reservationsByDay(reservations, now, 7);
  expect(days[6].d).toBe('27 Oct');
  expect(days[5]).toEqual({ d: '26 Oct', booked: 0, cancelled: 1 });
});
