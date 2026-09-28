import { getDepositPercentage, getOnlinePaymentAmount } from './paymentPolicy';

describe('online payment policy', () => {
  test('uses the configured deposit tiers at their boundaries', () => {
    expect(getDepositPercentage(4999.99)).toBe(100);
    expect(getDepositPercentage(5000)).toBe(50);
    expect(getDepositPercentage(20000)).toBe(50);
    expect(getDepositPercentage(20000.01)).toBe(25);
  });

  test('allows the optional half payment under ₱5,000', () => {
    expect(getOnlinePaymentAmount(3000, 'full')).toBe(3000);
    expect(getOnlinePaymentAmount(3000, 'deposit')).toBe(1500);
  });

  test('calculates half and quarter deposits for larger bookings', () => {
    expect(getOnlinePaymentAmount(10000, 'deposit')).toBe(5000);
    expect(getOnlinePaymentAmount(50000, 'deposit')).toBe(12500);
  });
});