import { getCorporatePackage, isCorporateFeatureIncluded } from './corporatePackages';

describe('corporate package matrix', () => {
  test.each([
    [14, null],
    [15, { id: 'core', ratePerGuest: 2000, totalAmount: 30000 }],
    [29, { id: 'core', ratePerGuest: 2000, totalAmount: 58000 }],
    [30, { id: 'grand', ratePerGuest: 2500, totalAmount: 75000 }],
    [49, { id: 'grand', ratePerGuest: 2500, totalAmount: 122500 }],
    [50, { id: 'flex', ratePerGuest: 3000, totalAmount: 150000 }],
  ])('selects the correct tier for %i guests', (guests, expected) => {
    const result = getCorporatePackage(guests);
    if (expected === null) {
      expect(result).toBeNull();
      return;
    }
    expect(result).toMatchObject(expected);
  });

  test('maps stay bundles and shared benefits to the package tier', () => {
    expect(isCorporateFeatureIncluded('grand', 1, 'bundle-1')).toBe(true);
    expect(isCorporateFeatureIncluded('core', 1, 'bundle-1')).toBe(false);
    expect(isCorporateFeatureIncluded('grand', 3, 'bundle-2')).toBe(true);
    expect(isCorporateFeatureIncluded('grand', 4, 'bundle-3')).toBe(false);
    expect(isCorporateFeatureIncluded('flex', 4, 'bundle-3')).toBe(true);
    expect(isCorporateFeatureIncluded('flex', 1, 'whole-property')).toBe(true);
    expect(isCorporateFeatureIncluded('core', 1, 'function-hall')).toBe(true);
  });
});
