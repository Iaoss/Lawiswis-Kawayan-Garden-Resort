import { getDepositPercentage, getOnlinePaymentAmount } from './paymentPolicy';

describe('online payment policy', () => {
  test('uses a 25% deposit at every reservation total', () => {
    expect(getDepositPercentage(4999.99)).toBe(25);
    expect(getDepositPercentage(5000)).toBe(25);
    expect(getDepositPercentage(20000)).toBe(25);
    expect(getDepositPercentage(20000.01)).toBe(25);
  });

  test('calculates full payment or a 25% deposit under ₱5,000', () => {
    expect(getOnlinePaymentAmount(3000, 'full')).toBe(3000);
    expect(getOnlinePaymentAmount(3000, 'deposit')).toBe(750);
  });

  test('calculates a 25% deposit for larger bookings', () => {
    expect(getOnlinePaymentAmount(10000, 'deposit')).toBe(2500);
    expect(getOnlinePaymentAmount(50000, 'deposit')).toBe(12500);
  });
});