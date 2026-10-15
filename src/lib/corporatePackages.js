export const CORPORATE_PACKAGES = [
  { id: 'core', name: 'Bamboo Core', minGuests: 15, maxGuests: 29, ratePerGuest: 2000 },
  { id: 'grand', name: 'Bamboo Grand', minGuests: 30, maxGuests: 49, ratePerGuest: 2500 },
  { id: 'flex', name: 'Bamboo Flex', minGuests: 50, maxGuests: null, ratePerGuest: 3000 },
];

export const CORPORATE_FEATURE_ROWS = [
  { id: 'bundle-1', label: 'One room night or day tour: Bamboo Kits', group: 'Stay bundle' },
  { id: 'bundle-2', label: '1–3 room nights: Bamboo Kits, Seeds, and Corner', group: 'Stay bundle' },
  { id: 'bundle-3', label: '4+ room nights: Kits, Seeds, Corner, Bamboo Care, Wellness Representative, and newsletter subscription', group: 'Stay bundle' },
  { id: 'whole-property', label: 'Whole property rental option', group: 'Resort access' },
  { id: 'function-hall', label: 'Function hall and other amenity discounts', group: 'Resort access' },
  { id: 'flexible-times', label: 'Flexible check-in / check-out', group: 'Resort access' },
  { id: 'accommodation', label: 'Optional accommodation and meal packages', group: 'Resort access' },
];

export function getCorporatePackage(totalGuests) {
  if (!Number.isSafeInteger(totalGuests) || totalGuests < 15) return null;
  const tier = CORPORATE_PACKAGES.find(({ minGuests, maxGuests }) =>
    totalGuests >= minGuests && (maxGuests === null || totalGuests <= maxGuests));
  if (!tier) return null;
  return { ...tier, totalAmount: totalGuests * tier.ratePerGuest };
}

export function isCorporateFeatureIncluded(packageId, nights, featureId) {
  if (!CORPORATE_PACKAGES.some(tier => tier.id === packageId)) return false;
  const duration = Number.isInteger(nights) && nights > 0 ? nights : 1;

  if (featureId === 'bundle-1') return duration === 1 && ['grand', 'flex'].includes(packageId);
  if (featureId === 'bundle-2') return duration >= 2 && duration <= 3 && ['grand', 'flex'].includes(packageId);
  if (featureId === 'bundle-3') return duration >= 4 && packageId === 'flex';
  if (featureId === 'whole-property') return packageId === 'flex';
  if (['function-hall', 'flexible-times', 'accommodation'].includes(featureId)) return true;
  return false;
}

