import { getBookingOptionId, getRequestedBookingFields, normalizeBookingDetails, priceBookingDetails } from './bookingDetails';
import { getDateOccupancy } from './dateOccupancy';
import { calculateReservationModification } from '../../lib/reservationModification';

// 12:35 PM, 24 Oct 2026 in Manila.
const now = new Date('2026-10-24T04:35:00Z');
const couple = { name: 'Couple Room', type: 'Deluxe' };

describe('booking details rules (all portals)', () => {
  test('tours are single-day bookings at tour hours', () => {
    const { details } = normalizeBookingDetails({ bookingType: 'daytour', tourPeriod: 'night', checkIn: '2026-10-25', checkOut: '2026-10-30', adults: 2 }, { now });
    expect(details).toMatchObject({ checkIn: '2026-10-25', checkOut: '2026-10-25', nights: 1, checkInTime: '5:00 PM', checkOutTime: '10:00 PM' });
  });

  test('blocks today\'s day tour after 8:00 AM but allows the night tour', () => {
    expect(normalizeBookingDetails({ bookingType: 'daytour', tourPeriod: 'day', checkIn: '2026-10-24', adults: 2 }, { now }).error).toMatch(/8:00 AM/);
    expect(normalizeBookingDetails({ bookingType: 'daytour', tourPeriod: 'night', checkIn: '2026-10-24', adults: 2 }, { now }).details).toBeTruthy();
  });

  test('overnight stays need a later check-out and an open check-in time', () => {
    expect(normalizeBookingDetails({ bookingType: 'overnight', checkIn: '2026-10-25', checkOut: '2026-10-25', adults: 2 }, { now }).error).toBeTruthy();
    const afterTwo = new Date('2026-10-24T06:35:00Z'); // 2:35 PM: the 10 AM slot closed at 2 PM
    expect(normalizeBookingDetails({ bookingType: 'overnight', overnightTimeSlot: 'morning', checkIn: '2026-10-24', checkOut: '2026-10-25', adults: 2 }, { now: afterTwo }).error).toMatch(/11:00 AM/);
    expect(normalizeBookingDetails({ bookingType: 'overnight', overnightTimeSlot: 'afternoon', checkIn: '2026-10-24', checkOut: '2026-10-26', adults: 2 }, { now }).details.nights).toBe(2);
  });

  test('keeping a past start date is allowed when editing a checked-in stay', () => {
    const input = { bookingType: 'overnight', checkIn: '2026-10-22', checkOut: '2026-10-27', adults: 2 };
    expect(normalizeBookingDetails(input, { now }).error).toBeTruthy();
    expect(normalizeBookingDetails(input, { now, keepStartDate: '2026-10-22' }).details.nights).toBe(5);
  });

  test('enforces room guest limits and prices tours as room + per person', () => {
    expect(normalizeBookingDetails({ bookingType: 'daytour', tourPeriod: 'day', checkIn: '2026-10-25', adults: 4 }, { now, room: couple }).error).toBeTruthy();
    const { details } = normalizeBookingDetails({ bookingType: 'daytour', tourPeriod: 'day', checkIn: '2026-10-25', adults: 2, children: 1 }, { now, room: couple });
    // Couple room day rate ₱2,000 for 2, plus 1 child at ₱375 (same as adults).
    expect(priceBookingDetails(couple, details).subtotalAmount).toBe(2375);
    // Night tour: same room rate, child at the night rate of ₱475.
    const night = normalizeBookingDetails({ bookingType: 'daytour', tourPeriod: 'night', checkIn: '2026-10-25', adults: 2, children: 1 }, { now, room: couple }).details;
    expect(priceBookingDetails(couple, night).subtotalAmount).toBe(2475);
  });

  test('maps between booking options and saved fields', () => {
    expect(getBookingOptionId({ bookingType: 'daytour', tourPeriod: 'night' })).toBe('night');
    expect(getBookingOptionId({ bookingType: 'overnight' })).toBe('overnight');
    expect(getRequestedBookingFields({ requestedBookingType: 'daytour', requestedTourPeriod: 'day', requestedAdults: 3 }))
      .toEqual({ bookingType: 'daytour', tourPeriod: 'day', adults: 3 });
    expect(getRequestedBookingFields({ requestedCheckIn: '2026-10-25' })).toEqual({});
  });
});

describe('repricing a change of tour type or guests', () => {
  const policy = { version: 2, moreThanDays: 7, earlyRate: 20, midFromDays: 4, midRate: 50, lateRate: 100, dateChangeDays: 7 };
  test('a cheaper change (overnight to day tour) keeps the full original charge', () => {
    const reservation = {
      roomId: 'r1', bookingType: 'overnight', checkIn: '2026-12-01', checkOut: '2026-12-02', nights: 1,
      adults: 2, children: 0, totalAmount: 3000, amountPaid: 1500,
    };
    const change = calculateReservationModification(reservation, couple, '2026-12-05', '2026-12-05', policy, {
      bookingType: 'daytour', tourPeriod: 'day', adults: 2, children: 1, now,
    });
    // New price ₱2,275 is cheaper, but reductions aren't refunded.
    expect(change).toMatchObject({ outcome: 'eligible', updatedTotal: 3000, difference: 0, changeType: 'reduction_no_refund' });
  });
});

describe('date occupancy indicator', () => {
  const reservations = [
    { status: 'confirmed', bookingType: 'daytour', tourPeriod: 'day', checkIn: '2026-10-25', checkOut: '2026-10-25', adults: 2, children: 1 },
    { status: 'pending', bookingType: 'daytour', tourPeriod: 'night', checkIn: '2026-10-25', checkOut: '2026-10-25', adults: 4 },
    { status: 'checked-in', bookingType: 'overnight', checkIn: '2026-10-24', checkOut: '2026-10-26', adults: 2 },
    { status: 'confirmed', bookingType: 'overnight', checkIn: '2026-10-23', checkOut: '2026-10-25', adults: 2 },
    { status: 'cancelled', bookingType: 'daytour', tourPeriod: 'day', checkIn: '2026-10-25', checkOut: '2026-10-25', adults: 9 },
  ];
  test('counts bookings and guests per slot, skipping cancellations and departures', () => {
    const occupancy = getDateOccupancy(reservations, '2026-10-25');
    expect(occupancy.day).toEqual({ bookings: 1, guests: 3 });
    expect(occupancy.night).toEqual({ bookings: 1, guests: 4 });
    expect(occupancy.overnight).toEqual({ bookings: 1, guests: 2 });
    expect(occupancy.total).toEqual({ bookings: 3, guests: 9 });
  });
});

describe('walk-in smart suggestions', () => {
  // eslint-disable-next-line global-require
  const { suggestCottage, suggestRooms } = require('./bookingSuggestions');
  const rooms = [
    { id: 'a', name: 'Couple Room', type: 'Deluxe' },
    { id: 'b', name: 'Family Room for 4', type: 'FamilyRoom', baseCapacity: 4 },
    { id: 'c', name: 'Family Room for 6', type: 'FamilyRoom', baseCapacity: 6 },
    { id: 'd', name: 'Family Suite for 6', type: 'FamilySuite', baseCapacity: 6 },
  ];
  test('suggests rooms that fit the group, cheapest first', () => {
    const { details } = normalizeBookingDetails({ bookingType: 'daytour', tourPeriod: 'day', checkIn: '2026-10-25', adults: 5 }, { now });
    const ids = suggestRooms(rooms, details).map(item => item.room.id);
    expect(ids[0]).toBe('c');
    expect(ids).not.toContain('a');
  });
  test('suggests the smallest cottage that seats everyone', () => {
    expect(suggestCottage(4).cottage.id).toBe('umbrella-hut');
    expect(suggestCottage(8).cottage.id).toBe('garden-cabana');
    expect(suggestCottage(15).cottage.id).toBe('pavilion');
    expect(suggestCottage(25).note).toMatch(/another cottage/);
  });
});

describe('rate-card services', () => {
  // eslint-disable-next-line global-require
  const { priceService } = require('./services');
  test('spa is ₱1,000 per hour, 20% off for room guests', () => {
    expect(priceService('spa', { hours: 2 }).amount).toBe(2000);
    expect(priceService('spa', { hours: 2, roomGuest: true }).amount).toBe(1600);
    expect(priceService('spa', { hours: 0 }).error).toBeTruthy();
  });
  test('photoshoot package: ₱3,500 for 5 people / 4 hours, then +₱300 per person and +₱500 per hour', () => {
    expect(priceService('photoshoot', { persons: 5, hours: 4 }).amount).toBe(3500);
    expect(priceService('photoshoot', { persons: 7, hours: 5 }).amount).toBe(3500 + 600 + 500);
    expect(priceService('photoshoot', { persons: 5, hours: 10 }).error).toMatch(/8 AM–5 PM/);
  });
});

describe('step 3 recommendations', () => {
  const { pickRecommendedRooms } = require('./bookingSuggestions');
  const entry = (id, price, spare) => ({ room: { id, title: id }, price, spare });

  test('2 rooms for exactly the group, then 1 with a little more space', () => {
    const { recommended, others } = pickRecommendedRooms([
      entry('aruga', 3000, 1), entry('bituin', 3000, 0), entry('tadhana', 3000, 0),
      entry('minamahal', 3000, 0), entry('family', 4600, 2),
    ]);
    expect(recommended.map(r => [r.room.id, r.badge])).toEqual([
      ['bituin', 'Best fit'], ['minamahal', 'Also fits'], ['aruga', 'Room for +1'],
    ]);
    expect(others.map(r => r.room.id)).toEqual(['tadhana', 'family']);
  });

  test('no exact fit: the closest bigger rooms fill in', () => {
    const { recommended } = pickRecommendedRooms([entry('a', 4600, 1), entry('b', 6200, 3), entry('c', 5600, 1)]);
    expect(recommended.map(r => r.room.id)).toEqual(['a', 'c', 'b']);
  });
});

describe('booking change history', () => {
  const { getBookingChanges } = require('./bookingChanges');
  test('lists staff edits and guest requests, newest first', () => {
    const changes = getBookingChanges({
      editHistory: [{ id: 'e1', editedAt: '2026-11-02T03:00:00Z', editedByName: 'Ana', from: { checkIn: '2026-11-20', checkOut: '2026-11-21', adults: 2, children: 0, totalAmount: 3000, bookingType: 'overnight' }, to: { checkIn: '2026-11-22', checkOut: '2026-11-23', adults: 3, children: 0, totalAmount: 3800, bookingType: 'overnight' } }],
      modificationRequest: { id: 'm1', status: 'rejected', requestedAt: '2026-11-03T03:00:00Z', originalCheckIn: '2026-11-22', originalCheckOut: '2026-11-23', requestedCheckIn: '2026-11-25', requestedCheckOut: '2026-11-26', staffReason: 'Fully booked' },
    });
    expect(changes.map(c => c.title)).toEqual(['Guest asked to change dates · rejected', 'Edited by staff']);
    expect(changes[1].text).toMatch(/Dates 2026-11-20 → 2026-11-21 → 2026-11-22 → 2026-11-23/);
    expect(changes[1].text).toMatch(/Guests 2\+0 → 3\+0 · Total ₱3,000 → ₱3,800/);
    expect(changes[0].text).toMatch(/Staff note: Fully booked/);
  });
});
