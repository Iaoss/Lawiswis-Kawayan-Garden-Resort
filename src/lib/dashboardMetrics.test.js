import {
  getDailyReservations,
  getFeedbackSummary,
  getMonthlyRevenue,
  getRevenueBySource,
} from './dashboardMetrics';
import { findNearestOpenDates } from './bookingSuggestions';

const at = iso => ({ seconds: Date.parse(iso) / 1000 });
const now = new Date('2026-10-26T04:00:00Z'); // 12 PM Philippine time

describe('monthly revenue', () => {
  test('sums payments into the last six months, by Philippine date', () => {
    const rows = getMonthlyRevenue([
      { amount: 1000, createdAt: at('2026-10-02T02:00:00Z') },
      { amount: 500, createdAt: at('2026-09-30T17:00:00Z') }, // Oct 1, 1 AM in Manila
      { amount: 2000, createdAt: at('2026-06-15T02:00:00Z') },
      { amount: 999, createdAt: at('2026-04-01T02:00:00Z') }, // too old
      { amount: 700, status: 'failed', createdAt: at('2026-10-03T02:00:00Z') },
    ], now);
    expect(rows.map(r => r.m)).toEqual(['May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct']);
    expect(rows.find(r => r.m === 'Oct').v).toBe(1500);
    expect(rows.find(r => r.m === 'Jun').v).toBe(2000);
    expect(rows.find(r => r.m === 'Sep').v).toBe(0);
  });
});

describe('daily reservations', () => {
  test('counts new bookings and cancellations for the last seven days', () => {
    const rows = getDailyReservations([
      { createdAt: at('2026-10-26T01:00:00Z'), status: 'confirmed' },
      { createdAt: at('2026-10-20T01:00:00Z'), status: 'cancelled', cancelledAt: '2026-10-25T03:00:00.000Z' },
      { createdAt: at('2026-10-01T01:00:00Z'), status: 'confirmed' }, // outside the window
    ], now);
    expect(rows).toHaveLength(7);
    expect(rows[6]).toMatchObject({ key: '2026-10-26', booked: 1, cancelled: 0 });
    expect(rows[5]).toMatchObject({ key: '2026-10-25', booked: 0, cancelled: 1 });
    expect(rows[0]).toMatchObject({ key: '2026-10-20', booked: 1 });
  });
});

describe('revenue by source', () => {
  const reservations = [
    {
      checkIn: '2026-10-10', status: 'checked-out', totalAmount: 5000, cottageFee: 1000, extraCharges: 2300, lateCheckoutChargeTotal: 200,
      extraChargeItems: [
        { serviceId: 'spa', amount: 800 },
        { serviceId: 'photoshoot', amount: 1000 },
        { description: 'Minibar', amount: 300 },
      ],
    },
    { checkIn: '2026-10-12', status: 'cancelled', totalAmount: 4000, cancellationFee: 2000 },
    { checkIn: '2026-01-05', status: 'checked-out', totalAmount: 9999 },
  ];

  test('splits rooms, cottages, each service, other charges and cancellation fees', () => {
    const { rows, total } = getRevenueBySource(reservations, { from: '2026-10-01', to: '2026-10-31' });
    const value = id => rows.find(r => r.id === id).value;
    expect(value('rooms')).toBe(4000);
    expect(value('cottages')).toBe(1000);
    expect(value('spa')).toBe(800);
    expect(value('photoshoot')).toBe(1000);
    expect(value('charges')).toBe(300); // minibar
    expect(value('lateFees')).toBe(200);
    expect(value('cancellationFees')).toBe(2000);
    expect(total).toBe(9300);
  });

  test('counts everything without a range', () => {
    expect(getRevenueBySource(reservations).total).toBe(9300 + 9999);
  });
});

describe('feedback summary', () => {
  const feedback = [
    { rating: 5, ratings: { rooms: 5, staff: 5 }, comment: 'Lovely garden', read: false, createdAt: at('2026-10-25T00:00:00Z') },
    { rating: 4, ratings: { rooms: 3, staff: 5, ambience: 4 }, read: true, createdAt: at('2026-10-01T00:00:00Z') },
    { rating: 2, ratings: { rooms: 2 }, comment: 'Too hot', read: true, createdAt: at('2026-09-01T00:00:00Z') },
  ];

  test('averages overall and per category from real feedback', () => {
    const summary = getFeedbackSummary(feedback);
    expect(summary.ratedCount).toBe(3);
    expect(summary.average).toBe(3.7);
    expect(summary.positive).toBe(2);
    expect(summary.negative).toBe(1);
    expect(summary.unread).toBe(1);
    const rooms = summary.categories.find(c => c.key === 'rooms');
    expect(rooms.average).toBeCloseTo(10 / 3);
    expect(summary.categories.find(c => c.key === 'facilities').count).toBe(0);
    expect(summary.latestComments[0].comment).toBe('Lovely garden');
  });

  test('can look at recent feedback only', () => {
    const recent = getFeedbackSummary(feedback, { sinceMs: Date.parse('2026-10-19T00:00:00Z') });
    expect(recent.ratedCount).toBe(1);
    expect(recent.average).toBe(5);
  });

  test('says so when there are no ratings', () => {
    expect(getFeedbackSummary([]).word).toBe('No ratings yet');
  });
});

describe('closest available dates', () => {
  test('offers the nearest free dates of the same length, nearest first', () => {
    const options = findNearestOpenDates({
      checkIn: '2026-12-10',
      checkOut: '2026-12-12',
      bookedRanges: [{ checkIn: '2026-12-09', checkOut: '2026-12-13' }],
      minDate: '2026-10-27',
      maxDate: '2026-12-26',
    });
    expect(options[0]).toEqual({ checkIn: '2026-12-13', checkOut: '2026-12-15', daysFromRequested: 3 });
    options.forEach(option => expect(option.checkOut > option.checkIn).toBe(true));
    expect(options).toHaveLength(3);
  });

  test('works for single-day tours and respects the date limits', () => {
    const options = findNearestOpenDates({
      checkIn: '2026-10-28',
      checkOut: '2026-10-28',
      bookedRanges: [{ checkIn: '2026-10-28', checkOut: '2026-10-28' }],
      minDate: '2026-10-28',
      maxDate: '2026-10-29',
    });
    expect(options).toEqual([{ checkIn: '2026-10-29', checkOut: '2026-10-29', daysFromRequested: 1 }]);
  });
});
