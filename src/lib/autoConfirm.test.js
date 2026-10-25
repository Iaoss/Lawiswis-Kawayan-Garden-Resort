import { shouldAutoConfirm } from '../../lib/recordPayMongoPayment';

describe('auto-confirm after a verified online payment', () => {
  const pending = { status: 'pending', totalAmount: 6000 };
  const booking = { paymentType: 'booking' };

  test('confirms a pending booking once the deposit is covered', () => {
    expect(shouldAutoConfirm(pending, booking, 3000)).toBe(true); // 50% deposit
    expect(shouldAutoConfirm(pending, booking, 6000)).toBe(true); // paid in full
    expect(shouldAutoConfirm(pending, booking, 2999)).toBe(false);
  });

  test('leaves other bookings and payments alone', () => {
    expect(shouldAutoConfirm({ ...pending, status: 'cancelled' }, booking, 6000)).toBe(false);
    expect(shouldAutoConfirm({ ...pending, status: 'confirmed' }, booking, 6000)).toBe(false);
    expect(shouldAutoConfirm({ ...pending, type: 'corporate' }, booking, 6000)).toBe(false);
    expect(shouldAutoConfirm(pending, { paymentType: 'billing' }, 6000)).toBe(false);
    expect(shouldAutoConfirm(pending, { paymentType: 'booking', modificationRequestId: 'm1' }, 6000)).toBe(false);
  });
});
