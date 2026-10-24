import { calculateReservationModification } from '../../lib/reservationModification';

const policy = { atLeast30Days: 0, lessThan30Days: 50, lessThan7Days: 100 };
// Noon, 24 Oct 2026, Philippine time.
const now = new Date('2026-10-24T04:00:00Z');

describe('reservation change pricing (resort policy)', () => {
  const room = { type: 'Couple Room', price: 3000, capacity: 2 };
  const reservation = {
    roomId: 'room-1',
    bookingType: 'overnight',
    checkIn: '2027-01-10',
    checkOut: '2027-01-11',
    adults: 2,
    children: 0,
    totalAmount: 3000,
    amountPaid: 1500,
  };

  test('requires a 50% deposit on the price difference for extensions', () => {
    const result = calculateReservationModification(reservation, room, '2027-01-10', '2027-01-12', policy, { now });
    expect(result).toMatchObject({ outcome: 'eligible', changeType: 'extension', difference: 3000, paymentDue: 1500 });
  });

  test('shortening the stay keeps the full charge, with no refund', () => {
    const result = calculateReservationModification(
      { ...reservation, checkOut: '2027-01-13', totalAmount: 9000, amountPaid: 9000 },
      room, '2027-01-10', '2027-01-11', policy, { now },
    );
    expect(result).toMatchObject({ outcome: 'eligible', changeType: 'reduction_no_refund', updatedTotal: 9000, difference: 0, refundDue: 0 });
  });

  test('refuses date moves less than 30 days before arrival or on arrival', () => {
    const soon = { ...reservation, checkIn: '2026-11-10', checkOut: '2026-11-11' };
    expect(calculateReservationModification(soon, room, '2026-11-12', '2026-11-13', policy, { now }).outcome).toBe('not_allowed');
    const today = { ...reservation, checkIn: '2026-10-24', checkOut: '2026-10-25' };
    expect(calculateReservationModification(today, room, '2026-10-27', '2026-10-28', policy, { now }).reason).toMatch(/non-convertible/);
  });

  test('sends unsupported pricing cases for manual review', () => {
    expect(calculateReservationModification({ ...reservation, type: 'corporate' }, room, '2027-01-10', '2027-01-12', policy, { now }).outcome).toBe('needs_review');
    expect(calculateReservationModification({ ...reservation, promoCode: 'SAVE' }, room, '2027-01-10', '2027-01-12', policy, { now }).outcome).toBe('needs_review');
  });
});
