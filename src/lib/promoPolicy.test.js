import { evaluatePromo, normalizePromoCode } from './promoPolicy';

const activePromo = {
  code: 'SAVE10',
  active: true,
  discountType: 'percentage',
  discountValue: 10,
  validFrom: '2026-01-01',
  validUntil: '2026-12-31',
  usageLimit: 50,
  usageCount: 3,
  minimumSpend: 1000,
};

describe('promo policy', () => {
  test('normalizes code strings', () => {
    expect(normalizePromoCode('  summer20 ')).toBe('SUMMER20');
  });

  test('calculates percentage and fixed discounts without exceeding subtotal', () => {
    expect(evaluatePromo(activePromo, 10000, '2026-06-01')).toMatchObject({ valid: true, discountAmount: 1000, totalAmount: 9000 });
    expect(evaluatePromo({ ...activePromo, discountType: 'fixed', discountValue: 5000 }, 3000, '2026-06-01'))
      .toMatchObject({ valid: true, discountAmount: 3000, totalAmount: 0 });
  });

  test.each([
    [{ ...activePromo, active: false }, 5000, '2026-06-01', 'This code is inactive'],
    [activePromo, 5000, '2025-12-31', 'Code is not active yet'],
    [activePromo, 5000, '2027-01-01', 'Code expired'],
    [{ ...activePromo, usageCount: 50 }, 5000, '2026-06-01', 'Usage limit reached'],
    [activePromo, 999, '2026-06-01', 'Minimum spend is ₱1,000'],
  ])('rejects promo with correct reason', (promo, subtotal, today, error) => {
    expect(evaluatePromo(promo, subtotal, today)).toMatchObject({ valid: false, error });
  });
});
