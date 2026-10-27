import { getResortNow } from './bookingPricing';

// Group / corporate booking limits.
export const MIN_GROUP_GUESTS = 15;
export const MAX_GROUP_GUESTS = 250;
// Big groups must book at least a week ahead so the resort can inspect and
// prepare the areas.
export const GROUP_ADVANCE_DAYS = 7;

export const CORPORATE_PACKAGES = [
  { id: 'core', name: 'Bamboo Core', minGuests: 15, maxGuests: 29, ratePerGuest: 2000 },
  { id: 'grand', name: 'Bamboo Grand', minGuests: 30, maxGuests: 49, ratePerGuest: 2500 },
  { id: 'flex', name: 'Bamboo Flex', minGuests: 50, maxGuests: MAX_GROUP_GUESTS, ratePerGuest: 3000 },
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
  if (!Number.isSafeInteger(totalGuests) || totalGuests < MIN_GROUP_GUESTS || totalGuests > MAX_GROUP_GUESTS) return null;
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

// Error message for a group size outside 15–250 guests, or ''.
export function getGroupGuestError(totalGuests) {
  if (!Number.isSafeInteger(totalGuests) || totalGuests < MIN_GROUP_GUESTS) {
    return `Group bookings start at ${MIN_GROUP_GUESTS} guests. For smaller groups, book rooms individually.`;
  }
  if (totalGuests > MAX_GROUP_GUESTS) {
    return `Group bookings can have up to ${MAX_GROUP_GUESTS} guests. For larger events, please contact the resort.`;
  }
  return '';
}

// The earliest check-in date (YYYY-MM-DD) a group can book today, in
// Philippine time.
export function getEarliestGroupDate(now = new Date()) {
  const date = new Date(`${getResortNow(now).dateKey}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + GROUP_ADVANCE_DAYS);
  return date.toISOString().slice(0, 10);
}

// "November 3, 2026" for a YYYY-MM-DD date.
export function formatLongDate(dateKey) {
  return new Date(`${dateKey}T00:00:00Z`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

// Error message when a group check-in is less than a week away, or ''.
export function getGroupAdvanceNoticeError(checkIn, now = new Date()) {
  const earliest = getEarliestGroupDate(now);
  if (typeof checkIn === 'string' && checkIn >= earliest) return '';
  return `Group and corporate bookings must be made at least ${GROUP_ADVANCE_DAYS} days before check-in, so the resort can inspect and prepare the areas. The earliest date you can book is ${formatLongDate(earliest)}.`;
}
