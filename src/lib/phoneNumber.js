// Philippine mobile numbers: 11 digits starting with 09 (e.g. 09171234567).
export const PH_MOBILE = /^09\d{9}$/;

// Digits only; +63 / 63 at the start becomes 0. Returns '' if it isn't a
// valid Philippine mobile number.
export function normalizePhMobile(value) {
  let digits = String(value || '').replace(/\D/g, '');
  if (digits.startsWith('63') && digits.length === 12) digits = `0${digits.slice(2)}`;
  return PH_MOBILE.test(digits) ? digits : '';
}
