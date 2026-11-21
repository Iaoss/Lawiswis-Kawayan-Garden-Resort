// Warn while the person is still filling in a form, not only on submit.
//
//   guestFieldError(key, form)  → the message for one guest-details field
//                                 (checked when the field loses focus).
//   phoneTypingError(value)     → shown straight away while a mobile number
//                                 is being typed, as soon as it can no longer
//                                 become a valid 09XXXXXXXXX number.
import { NAME_ALLOWED_CHARACTERS, NAME_PATTERN } from './nameValidation';
import { getContactFieldErrors } from './preferredContactMethods';

const NAME_KEYS = ['firstName', 'lastName'];
const CONTACT_KEYS = ['preferredContactMethod', 'email', 'phone', 'contactLink'];

export function nameError(value) {
  const text = String(value || '').trim();
  if (!text) return 'This is required.';
  if (!NAME_ALLOWED_CHARACTERS.test(text)) return 'Numbers and special symbols are not allowed.';
  if (!NAME_PATTERN.test(text)) return 'Use 2-35 letters, spaces, hyphens, or apostrophes.';
  return '';
}

export function phoneTypingError(value) {
  const digits = String(value || '');
  if (!digits) return '';
  if (!'09'.startsWith(digits.slice(0, 2))) return 'Mobile numbers start with 09.';
  if (digits.length === 11 && !/^09\d{9}$/.test(digits)) return 'Enter an 11-digit mobile number starting with 09.';
  return '';
}

export function guestFieldError(key, form = {}) {
  if (NAME_KEYS.includes(key)) return nameError(form[key]);
  if (CONTACT_KEYS.includes(key)) return getContactFieldErrors(form)[key] || '';
  return '';
}
