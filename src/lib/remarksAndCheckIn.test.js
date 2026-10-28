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
