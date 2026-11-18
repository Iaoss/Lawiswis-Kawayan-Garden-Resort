import { datesOfBooking, getCapacityProblem, getCrowdedDates, peopleOnDate } from './resortCapacity';
import { getDateOccupancy } from './dateOccupancy';

const D = '2026-12-05';
const overnight = (id, guests, extra = {}) => ({ id, status: 'confirmed', bookingType: 'overnight', checkIn: '2026-12-05', checkOut: '2026-12-06', adults: guests, children: 0, ...extra });
const dayTour = (id, guests, extra = {}) => ({ id, status: 'confirmed', bookingType: 'daytour', tourPeriod: 'day', checkIn: D, checkOut: D, adults: guests, children: 0, ...extra });
const nightTour = (id, guests) => ({ ...dayTour(id, guests), tourPeriod: 'night' });

test('busiest moment = overnight + the bigger of day tour and night tour', () => {
  const people = peopleOnDate([overnight('a', 100), dayTour('b', 60), nightTour('c', 40)], D);
  expect(people).toMatchObject({ overnight: 100, day: 60, night: 40, peak: 160, remaining: 90, full: false });
});

test('groups count by their total; day visitors count; closed bookings and room blocks do not', () => {
  const people = peopleOnDate([
    { id: 'g', type: 'corporate', status: 'pending', bookingType: 'corporate', checkIn: D, checkOut: D, adults: 0, totalGuests: 120 },
    overnight('o', 4, { dayVisitorAdults: 3, dayVisitorPeriod: 'day' }),
    overnight('x', 50, { status: 'cancelled' }),
    overnight('y', 50, { status: 'checked-out' }),
    { id: 'blk', type: 'corporate-room', status: 'confirmed', bookingType: 'overnight', checkIn: D, checkOut: '2026-12-06', adults: 4 },
  ], D);
  expect(people).toMatchObject({ overnight: 4, day: 123, peak: 127 });
});

test('expired unpaid online holds no longer take places', () => {
  const now = Date.parse('2026-12-01T12:00:00Z');
  const expired = overnight('h', 200, { status: 'pending', type: 'online', paymentMethod: 'online', paymentStatus: 'pending', amountPaid: 0, createdAt: { toMillis: () => now - 3 * 86400000 } });
  expect(peopleOnDate([expired], D, { now }).peak).toBe(0);
  expect(getDateOccupancy([expired], D, now).total.guests).toBe(0);
});

test('a booking that would go over 250 is refused with a clear message', () => {
  const existing = [overnight('a', 200), dayTour('b', 40)];
  const fits = getCapacityProblem(existing, dayTour('new', 10));
  expect(fits).toBeNull();
  const tooMany = getCapacityProblem(existing, dayTour('new', 20));
  expect(tooMany).toMatchObject({ date: D, remaining: 10, requested: 20 });
  expect(tooMany.message).toMatch(/room for only 10 more guests/);
  const full = getCapacityProblem([overnight('a', 250)], dayTour('new', 2));
  expect(full.message).toMatch(/The resort is full on/);
});

test('a night tour fits beside a full day tour (they do not overlap)', () => {
  const existing = [overnight('a', 150), dayTour('b', 100)];
  expect(getCapacityProblem(existing, nightTour('new', 100))).toBeNull();
  expect(getCapacityProblem(existing, nightTour('new', 101))).not.toBeNull();
});

test('changing a booking does not count it twice', () => {
  const existing = [overnight('a', 240), overnight('me', 10)];
  expect(getCapacityProblem(existing, overnight('me', 10), { ignoreIds: ['me'] })).toBeNull();
  expect(getCapacityProblem(existing, overnight('me', 11), { ignoreIds: ['me'] })).not.toBeNull();
});

test('every night of a stay is checked', () => {
  expect(datesOfBooking(overnight('s', 2, { checkOut: '2026-12-08' }))).toEqual(['2026-12-05', '2026-12-06', '2026-12-07']);
  const fullOnSecondNight = [overnight('a', 250, { checkIn: '2026-12-06', checkOut: '2026-12-07' })];
  expect(getCapacityProblem(fullOnSecondNight, overnight('s', 2, { checkOut: '2026-12-08' })).date).toBe('2026-12-06');
});

test('staff alerts list full and nearly full dates', () => {
  const dates = getCrowdedDates([overnight('a', 230), dayTour('b', 25, { checkIn: '2026-12-06', checkOut: '2026-12-06' })], { from: '2026-12-04', days: 4 });
  expect(dates.map(d => [d.date, d.full])).toEqual([['2026-12-05', false]]);
  expect(getCrowdedDates([overnight('a', 250)], { from: D, days: 1 })[0].full).toBe(true);
});
