import { calculateSeniorPwdDiscount, getDiscountIdError } from './seniorPwdDiscount';

test('one senior out of two guests on a ₱5,600 room', () => {
  const d = calculateSeniorPwdDiscount({ amount: 5600, totalGuests: 2, qualifiedGuests: 1 });
  // share 2,800 → net 2,500 → 20% off = 2,000 to pay → 800 less
  expect(d.share).toBe(2800);
  expect(d.vatRemoved).toBe(300);
  expect(d.discount20).toBe(500);
  expect(d.total).toBe(800);
});

test('ID checks', () => {
  const base = { holderName: 'Juan Cruz', today: '2026-11-06', checked: true };
  expect(getDiscountIdError({ ...base, kind: 'pwd', idNumber: '13-7404-000-0001234', expiryDate: '2027-01-01' })).toBe('');
  expect(getDiscountIdError({ ...base, kind: 'pwd', idNumber: '12345', expiryDate: '2027-01-01' })).toMatch(/not a valid PWD/);
  expect(getDiscountIdError({ ...base, kind: 'pwd', idNumber: '0314100000003045' })).toBe('');
  expect(getDiscountIdError({ ...base, kind: 'pwd', idNumber: '13-7404-000-0001234', expiryDate: '2026-01-01' })).toMatch(/expired/);
  expect(getDiscountIdError({ ...base, kind: 'senior', idNumber: 'OSCA-1234', birthDate: '1970-05-01' })).toMatch(/60 and older/);
  expect(getDiscountIdError({ ...base, kind: 'senior', idNumber: 'OSCA-1234', birthDate: '1960-05-01' })).toBe('');
  expect(getDiscountIdError({ ...base, checked: false, kind: 'senior', idNumber: 'OSCA-1234', birthDate: '1960-05-01' })).toMatch(/physical ID/);
});
