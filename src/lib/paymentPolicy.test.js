import { getDepositPercentage, getOnlinePaymentAmount, RESERVATION_DEPOSIT_PERCENTAGE } from './paymentPolicy';

describe('online payment policy', () => {
  test('uses a 50% deposit at every reservation total', () => {
    expect(RESERVATION_DEPOSIT_PERCENTAGE).toBe(50);
    expect(getDepositPercentage(4999.99)).toBe(50);
    expect(getDepositPercentage(5000)).toBe(50);
    expect(getDepositPercentage(20000)).toBe(50);
    expect(getDepositPercentage(20000.01)).toBe(50);
  });

  test('calculates full payment or a 50% deposit under ₱5,000', () => {
    expect(getOnlinePaymentAmount(3000, 'full')).toBe(3000);
    expect(getOnlinePaymentAmount(3000, 'deposit')).toBe(1500);
  });

  test('calculates a 50% deposit for larger bookings', () => {
    expect(getOnlinePaymentAmount(10000, 'deposit')).toBe(5000);
    expect(getOnlinePaymentAmount(50000, 'deposit')).toBe(25000);
  });
});