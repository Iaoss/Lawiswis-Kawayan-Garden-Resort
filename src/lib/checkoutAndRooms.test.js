import { getCheckoutDue, getOverstay, getScheduledCheckOutMs } from './reservationStatus';
import { getGuestCountViolation, getRoomCapacityPolicy } from './bookingPricing';
import { suggestRooms } from './bookingSuggestions';

describe('check-out reminders and late check-out', () => {
  const stay = { status: 'checked-in', checkIn: '2026-11-04', checkOut: '2026-11-05', checkOutTime: '12:00 PM' };
  const noonManila = Date.UTC(2026, 10, 5, 4, 0); // 12:00 PM in Manila

  it('shows a guest as due within 2 hours of check-out', () => {
    expect(getCheckoutDue(stay, new Date(noonManila - 90 * 60000))).toEqual({ dueMs: noonManila, minutesLeft: 90 });
    expect(getCheckoutDue(stay, new Date(noonManila - 3 * 3600000))).toBeNull();
    expect(getCheckoutDue(stay, new Date(noonManila + 60000))).toBeNull();
    expect(getCheckoutDue({ ...stay, status: 'confirmed' }, new Date(noonManila - 60000))).toBeNull();
  });

  it('moves check-out later when staff give more time, so it is not an overstay', () => {
    const extended = { ...stay, lateCheckoutUntil: noonManila + 2 * 3600000 };
    expect(getScheduledCheckOutMs(extended)).toBe(noonManila + 2 * 3600000);
    expect(getOverstay(extended, new Date(noonManila + 3600000))).toBeNull();
    expect(getOverstay(stay, new Date(noonManila + 3600000))).not.toBeNull();
    // An extension earlier than the booked time is ignored.
    expect(getScheduledCheckOutMs({ ...stay, lateCheckoutUntil: noonManila - 1 })).toBe(noonManila);
  });
});

describe('couple rooms with an extra bed', () => {
  const deluxe = { type: 'Deluxe', roomNumber: 'Aruga', capacity: 4, description: 'Cozy and well appointed space(Option to add bed)', status: 'vacant' };
  const standard = { type: 'Standard', roomNumber: 'Hirang', capacity: 2, price: 3000, status: 'vacant' };
  const family = { type: 'FamilyRoom', roomNumber: 'Kalinga', capacity: 4, price: 4600, status: 'vacant' };

  it('takes a third adult on the extra bed', () => {
    expect(getRoomCapacityPolicy(deluxe).label).toBe('Couple Room with Extra Bed');
    expect(getGuestCountViolation(deluxe, 3, 0)).toBeNull();
    expect(getGuestCountViolation(standard, 3, 0)).not.toBeNull();
  });

  it('suggests the extra-bed room before a family room for 3 guests', () => {
    const details = { bookingType: 'overnight', tourPeriod: '', nights: 1, adults: 3, children: 0, checkIn: '2026-11-20', checkOut: '2026-11-21' };
    const picks = suggestRooms([family, standard, deluxe], details);
    expect(picks.map(p => p.room.roomNumber)).toEqual(['Aruga', 'Kalinga']);
    expect(picks[0].total).toBe(3000 + 800);
  });
});

describe('standard couple rooms', () => {
  it('are 2-guest couple rooms', () => {
    const standard = { type: 'Standard', roomNumber: 'Hirang', capacity: 2 };
    expect(getRoomCapacityPolicy(standard)).toMatchObject({ label: 'Couple Room', maxGuests: 2 });
    expect(getGuestCountViolation(standard, 2, 0)).toBeNull();
    expect(getGuestCountViolation(standard, 1, 1)).toBeNull();
    expect(getGuestCountViolation(standard, 2, 1)).not.toBeNull();
  });
});

describe('couple rooms with an extra bed hold 3 guests', () => {
  const panaginip = { type: 'Deluxe', roomNumber: 'Panaginip', description: 'Ample space and relaxing atmosphere(Option to add bed)' };
  it('allows 3 guests, never 4', () => {
    expect(getRoomCapacityPolicy(panaginip)).toMatchObject({ maxGuests: 3, label: 'Couple Room with Extra Bed' });
    expect(getGuestCountViolation(panaginip, 3, 0)).toBeNull();
    expect(getGuestCountViolation(panaginip, 2, 1)).toBeNull();
    expect(getGuestCountViolation(panaginip, 3, 1)).not.toBeNull();
    expect(getGuestCountViolation(panaginip, 4, 0)).not.toBeNull();
  });
});

describe('extra-bed rooms are known by name', () => {
  it('treats Giliw as a couple room with an extra bed even without the note', () => {
    const giliw = { type: 'Deluxe', roomNumber: 'Giliw', description: 'A family-friendly space in our old building.' };
    expect(getRoomCapacityPolicy(giliw)).toMatchObject({ maxGuests: 3, label: 'Couple Room with Extra Bed' });
    expect(getGuestCountViolation(giliw, 3, 0)).toBeNull();
    expect(getGuestCountViolation(giliw, 4, 0)).not.toBeNull();
  });
});
