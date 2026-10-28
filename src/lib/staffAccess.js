// Extra access an admin can give a receptionist, for a set time or until
// removed. Stored on the receptionist's users/{uid} document as
//   access: { [featureId]: { grantedAt, grantedBy, grantedByName, expiresAt|null, note } }
// The same list is checked by the browser (menus, pages), the server
// (/api routes) and the Firestore rules, so a grant can't be faked.
//
// Not grantable on purpose: user management, room prices and settings.

export const ACCESS_FEATURES = [
  // Pages
  { id: 'reports', label: 'Reports', group: 'Pages', path: 'reports', icon: 'ti-chart-bar', description: 'Reservation, occupancy and revenue reports.' },
  { id: 'payments', label: 'Payment Transactions', group: 'Pages', path: 'payments', icon: 'ti-cash', description: 'All payments and daily payment volume.' },
  { id: 'feedback', label: 'Feedback & QR', group: 'Pages', path: 'feedback', icon: 'ti-star', description: 'Guest feedback, the QR code and newsletter subscribers.' },
  { id: 'promos', label: 'Promos & Discounts', group: 'Pages', path: 'promos', icon: 'ti-discount', description: 'Create, edit, turn on and off promo codes.' },
  { id: 'news', label: 'News Management', group: 'Pages', path: 'news', icon: 'ti-news', description: 'Write, edit and delete website news.' },
  { id: 'inquiries', label: 'Contact Inquiries', group: 'Pages', path: 'contact-inquiries', icon: 'ti-mail', description: 'Website contact messages.' },
  { id: 'activity', label: 'Activity Log', group: 'Pages', path: 'activity', icon: 'ti-list-check', description: 'What every staff member did, and when.' },
  // Actions
  { id: 'cancel', label: 'Cancel bookings', group: 'Actions', description: 'Cancel bookings and approve cancellation requests without an admin.' },
  { id: 'refunds', label: 'Decide refunds', group: 'Actions', description: 'Approve or reject guest refund requests.' },
  { id: 'checkoutOverride', label: 'Check out with balance', group: 'Actions', description: 'Check out a guest who still owes money, with a reason.' },
];

export const ACCESS_FEATURE_IDS = ACCESS_FEATURES.map(feature => feature.id);

export const ACCESS_DURATIONS = [
  { id: '4h', label: '4 hours', hours: 4 },
  { id: 'shift', label: '12 hours (one shift)', hours: 12 },
  { id: '1d', label: '1 day', hours: 24 },
  { id: '3d', label: '3 days', hours: 72 },
  { id: '7d', label: '1 week', hours: 168 },
  { id: 'custom', label: 'Until a date and time…', hours: null },
  { id: 'manual', label: 'Until I remove it', hours: null },
];

export const getAccessFeature = id => ACCESS_FEATURES.find(feature => feature.id === id) || null;

export function toMillis(value) {
  if (!value) return 0;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (typeof value.seconds === 'number') return value.seconds * 1000;
  if (typeof value._seconds === 'number') return value._seconds * 1000;
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
}

// Is this grant in effect right now? No expiry means until removed.
export function isGrantActive(grant, now = Date.now()) {
  if (!grant || typeof grant !== 'object') return false;
  const expires = toMillis(grant.expiresAt);
  return !grant.expiresAt || expires > now;
}

// Does this staff member (users doc data with role and access) have the
// feature? Admins have everything; receptionists need an active grant.
export function hasFeature(user, featureId, now = Date.now()) {
  if (!user) return false;
  const role = String(user.role || '').toLowerCase();
  if (role === 'admin') return true;
  if (role !== 'receptionist' || !ACCESS_FEATURE_IDS.includes(featureId)) return false;
  return isGrantActive(user.access?.[featureId], now);
}

// Active grants, soonest to expire first, with their feature info.
export function getActiveGrants(user, now = Date.now()) {
  const access = user?.access && typeof user.access === 'object' ? user.access : {};
  return Object.entries(access)
    .filter(([id, grant]) => ACCESS_FEATURE_IDS.includes(id) && isGrantActive(grant, now))
    .map(([id, grant]) => ({ ...getAccessFeature(id), grant, expiresMs: toMillis(grant.expiresAt) || null }))
    .sort((a, b) => (a.expiresMs ?? Infinity) - (b.expiresMs ?? Infinity));
}

// When a grant ends, from a duration choice ("custom" uses customUntil).
// Returns a Date, null for "until removed", or an error message.
export function getGrantExpiry(durationId, customUntil, now = new Date()) {
  const duration = ACCESS_DURATIONS.find(item => item.id === durationId);
  if (!duration) return { error: 'Choose how long the access lasts.' };
  if (duration.id === 'manual') return { expiresAt: null };
  if (duration.id === 'custom') {
    const until = new Date(customUntil);
    if (!customUntil || Number.isNaN(until.getTime())) return { error: 'Pick the date and time the access ends.' };
    if (until.getTime() <= now.getTime() + 5 * 60000) return { error: 'The end time must be at least 5 minutes from now.' };
    if (until.getTime() > now.getTime() + 90 * 86400000) return { error: 'Temporary access can last up to 90 days. Choose “Until I remove it” for longer.' };
    return { expiresAt: until };
  }
  return { expiresAt: new Date(now.getTime() + duration.hours * 3600000) };
}

// "in 3 h", "in 2 days", "until removed", "expired".
export function describeExpiry(expiresMs, now = Date.now()) {
  if (!expiresMs) return 'Until removed';
  const left = expiresMs - now;
  if (left <= 0) return 'Expired';
  const minutes = Math.round(left / 60000);
  if (minutes < 60) return `${minutes} min left`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} h left`;
  return `${Math.round(hours / 24)} days left`;
}
