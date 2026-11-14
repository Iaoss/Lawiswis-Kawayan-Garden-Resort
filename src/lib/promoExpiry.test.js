import { evaluatePromo, getPromoStatus, isPromoExpired, manilaToday } from './promoPolicy';

const promo = { code: 'SUMMER10', active: true, discountType: 'percentage', discountValue: 10, validFrom: '2026-11-01', validUntil: '2026-11-13' };

test('a code is expired only after its last day', () => {
  expect(isPromoExpired(promo, '2026-11-13')).toBe(false);
  expect(isPromoExpired(promo, '2026-11-14')).toBe(true);
  expect(isPromoExpired({ ...promo, validUntil: '' }, '2030-01-01')).toBe(false);
});

test('status shows Expired even if the switch is still on', () => {
  expect(getPromoStatus(promo, '2026-11-14')).toEqual({ key: 'expired', label: 'Expired' });
  expect(getPromoStatus(promo, '2026-11-05').key).toBe('active');
  expect(getPromoStatus({ ...promo, active: false }, '2026-11-05').key).toBe('inactive');
  expect(getPromoStatus(promo, '2026-10-30').key).toBe('scheduled');
  expect(getPromoStatus({ ...promo, usageLimit: 5, usageCount: 5 }, '2026-11-05').key).toBe('used-up');
});

test('expiry uses Philippine time, not UTC', () => {
  // 2026-11-13 17:00 UTC is already 1 AM on Nov 14 in Manila.
  expect(manilaToday(Date.parse('2026-11-13T17:00:00Z'))).toBe('2026-11-14');
  expect(evaluatePromo(promo, 5000, '2026-11-14')).toMatchObject({ valid: false, error: 'Code expired' });
  expect(evaluatePromo(promo, 5000, '2026-11-13').valid).toBe(true);
});
