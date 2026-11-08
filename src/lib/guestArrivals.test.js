import { arrivedGuestCount, bookedGuestCount, guestsStillToArrive, normalizeArrivedGuests } from './guestArrivals';
import { buildBookingNotifications } from '../admin/lib/bookingNotifications';

describe('guest arrivals', () => {
  test('counts staying guests plus day visitors', () => {
    expect(bookedGuestCount({ adults: 3, children: 1 })).toBe(4);
    expect(bookedGuestCount({ adults: 2, dayVisitorAdults: 1, dayVisitorChildren: 1 })).toBe(4);
    expect(bookedGuestCount({ totalGuests: 20 })).toBe(20);
    expect(bookedGuestCount({})).toBe(0);
  });

  test('no recorded count means everyone arrived', () => {
    const r = { status: 'checked-in', adults: 4 };
    expect(arrivedGuestCount(r)).toBe(4);
    expect(guestsStillToArrive(r)).toBe(0);
  });

  test('2 of 4 arrived leaves 2 still to come, only while checked in', () => {
    const r = { status: 'checked-in', adults: 4, arrivedGuests: 2 };
    expect(guestsStillToArrive(r)).toBe(2);
    expect(guestsStillToArrive({ ...r, status: 'checked-out' })).toBe(0);
  });

  test('arrived count must be 1 up to the booked number', () => {
    expect(normalizeArrivedGuests(2, 4)).toBe(2);
    expect(normalizeArrivedGuests(9, 4)).toBe(4);
    expect(normalizeArrivedGuests(0, 4)).toBeNull();
    expect(normalizeArrivedGuests('x', 4)).toBeNull();
    expect(normalizeArrivedGuests(1.5, 4)).toBeNull();
  });

  test('bell shows groups with guests still to arrive', () => {
    const items = buildBookingNotifications([
      { id: 'abc12345', status: 'checked-in', type: 'walk-in', guestName: 'Ana', roomNumber: '3', adults: 4, arrivedGuests: 2 },
      { id: 'def67890', status: 'checked-in', type: 'walk-in', guestName: 'Ben', roomNumber: '4', adults: 2 },
    ], { now: Date.now() });
    const arriving = items.filter(i => i.id.startsWith('guests-arriving'));
    expect(arriving).toHaveLength(1);
    expect(arriving[0].details).toContain('2 of 4 here');
  });
});
