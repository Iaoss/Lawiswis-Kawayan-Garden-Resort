import { calculateReservationModification } from '../../lib/reservationModification';

const policy = { moreThan7Days: 20, between4And7Days: 50, lessThan3Days: 100 };

describe('reservation schedule modification pricing', () => {
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
    const result = calculateReservationModification(reservation, room, '2027-01-10', '2027-01-12', policy);
    expect(result).toMatchObject({ outcome: 'eligible', changeType: 'extension', difference: 3000, paymentDue: 1500 });
  });

  test('applies reduction fee and offsets the paid balance before calculating refund', () => {
    const result = calculateReservationModification(
      { ...reservation, checkOut: '2027-01-13', totalAmount: 9000, amountPaid: 9000 },
      room,
      '2027-01-10',
      '2027-01-11',
      policy
    );
    expect(result).toMatchObject({ outcome: 'eligible', changeType: 'reduction', cancellationFee: 1200, updatedTotal: 4200, refundDue: 4800 });
  });

  test('sends unsupported pricing cases for manual review', () => {
    expect(calculateReservationModification({ ...reservation, type: 'corporate' }, room, '2027-01-10', '2027-01-12', policy).outcome).toBe('needs_review');
    expect(calculateReservationModification({ ...reservation, promoCode: 'SAVE' }, room, '2027-01-10', '2027-01-12', policy).outcome).toBe('needs_review');
  });
});
