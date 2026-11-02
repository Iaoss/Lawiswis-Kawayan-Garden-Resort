import { getEarlyCheckInError } from './reservationStatus';
import { getReservationRemarks } from './reservationRemarks';

// 2026-10-28, 9:00 AM Philippine time.
const now = new Date('2026-10-28T01:00:00Z');

describe('check-in date', () => {
  test('blocks check-in before the booked date', () => {
    expect(getEarlyCheckInError({ checkIn: '2026-10-30' }, now)).toMatch(/October 30, 2026/);
  });
  test('allows check-in on the day and after', () => {
    expect(getEarlyCheckInError({ checkIn: '2026-10-28' }, now)).toBe('');
    expect(getEarlyCheckInError({ checkIn: '2026-10-27' }, now)).toBe('');
  });
});

describe('remarks', () => {
  test('explain an unpaid check-out with the reason and who approved it', () => {
    const [remark] = getReservationRemarks({
      status: 'checked-out', checkedOutWithBalance: 1500, checkedOutWithBalanceReason: 'Will pay by bank transfer', checkedOutWithBalanceByName: 'Ana',
    });
    expect(remark.label).toBe('Checked out with unpaid balance');
    expect(remark.text).toContain('Will pay by bank transfer');
    expect(remark.text).toContain('Ana');
  });
  test('list cancellations with the fee and refund', () => {
    const remarks = getReservationRemarks({ status: 'cancelled', cancellationReason: 'Guest asked to cancel online.', cancellationFee: 500, refundAmount: 1500 });
    expect(remarks[0].text).toMatch(/fee ₱500 · refund ₱1,500/);
  });
  test('are empty for a normal stay', () => {
    expect(getReservationRemarks({ status: 'checked-out' })).toEqual([]);
  });
});

describe('check-in needs full payment', () => {
  const { getCheckInPaymentError, canAutoCheckIn } = require('./reservationStatus');
  const now = new Date('2026-11-05T03:00:00Z'); // Nov 5, 11 AM in Manila

  it('blocks check-in while the guest owes money', () => {
    expect(getCheckInPaymentError({ totalAmount: 3000, amountPaid: 1500 })).toMatch(/still owes ₱1,500/);
    expect(getCheckInPaymentError({ totalAmount: 3000, extraCharges: 200, amountPaid: 3000 })).toMatch(/₱200/);
    expect(getCheckInPaymentError({ totalAmount: 3000, amountPaid: 3000 })).toBe('');
  });

  it('checks in a fully paid booking on its stay days only', () => {
    const paid = { status: 'confirmed', totalAmount: 3000, amountPaid: 3000, checkIn: '2026-11-05', checkOut: '2026-11-06' };
    expect(canAutoCheckIn(paid, now)).toBe(true);
    expect(canAutoCheckIn({ ...paid, checkIn: '2026-11-06', checkOut: '2026-11-07' }, now)).toBe(false);
    expect(canAutoCheckIn({ ...paid, checkIn: '2026-11-01', checkOut: '2026-11-02' }, now)).toBe(false);
    expect(canAutoCheckIn({ ...paid, amountPaid: 2999 }, now)).toBe(false);
    expect(canAutoCheckIn({ ...paid, status: 'cancelled' }, now)).toBe(false);
    expect(canAutoCheckIn({ ...paid, checkOut: '2026-11-05' }, now)).toBe(true);
  });
});
