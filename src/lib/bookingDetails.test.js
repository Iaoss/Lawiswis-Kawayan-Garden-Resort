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
    expect(normalizeBookingDetails({ bookingType: 'overnight', overnightTimeSlot: 'morning', checkIn: '2026-10-24', checkOut: '2026-10-25', adults: 2 }, { now }).error).toMatch(/10:00 AM/);
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
    // Couple room day rate ₱2,000 for 2, plus 1 child at ₱275.
    expect(priceBookingDetails(couple, details).subtotalAmount).toBe(2275);
    // Night tour: same room rate, child at the night rate of ₱375.
    const night = normalizeBookingDetails({ bookingType: 'daytour', tourPeriod: 'night', checkIn: '2026-10-25', adults: 2, children: 1 }, { now, room: couple }).details;
    expect(priceBookingDetails(couple, night).subtotalAmount).toBe(2375);
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
  const policy = { atLeast30Days: 0, lessThan30Days: 50, lessThan7Days: 100 };
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
    expect(suggestCottage(4).cottage.id).toBe('daybed');
    expect(suggestCottage(8).cottage.id).toBe('cabana');
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
