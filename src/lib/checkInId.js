// The ID a guest showed at check-in. Only the type and the last 2–4
// characters are kept (never the full number or a photo), for privacy.
export const ID_TYPES = [
  'National ID (PhilSys)', 'Driver’s license', 'Passport', 'UMID', 'Postal ID', 'Voter’s ID',
  'PRC ID', 'Senior citizen ID', 'PWD ID', 'Student ID', 'Company ID', 'Other',
];

// Clean { type, last4 } or null if it isn't valid.
export function normalizeIdCheck(value) {
  if (!value || typeof value !== 'object') return null;
  const type = ID_TYPES.includes(value.type) ? value.type : null;
  const last4 = String(value.last4 || '').trim().toUpperCase();
  if (!type || !/^[A-Z0-9]{2,4}$/.test(last4)) return null;
  return { type, last4 };
}
