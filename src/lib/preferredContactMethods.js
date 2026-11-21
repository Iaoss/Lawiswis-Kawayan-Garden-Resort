// How a guest wants the resort to reach them. Email and Phone use the
// details already on the booking form; Facebook Messenger needs the guest's
// Facebook profile link.
export const PREFERRED_CONTACT_METHODS = [
  'Email',
  'Phone',
  'Facebook Messenger',
];

export const FACEBOOK_CONTACT_METHOD = 'Facebook Messenger';

// Shown above the contact fields on every booking form.
export const CONTACT_REQUIREMENT_NOTE = 'Email and mobile number are optional, but we need at least one way to reach you about your booking. Choose your preferred contact method and fill in that detail (mobile number, email, or Facebook link).';

export function isPreferredContactMethod(value) {
  return PREFERRED_CONTACT_METHODS.includes(value);
}

// facebook.com/…, m.facebook.com/…, fb.com/… or m.me/… links.
const FACEBOOK_LINK = /^(https?:\/\/)?((www|m|web)\.)?(facebook\.com|fb\.com|m\.me)\/[^\s]+$/i;

export function isFacebookLink(value) {
  const link = String(value || '').trim();
  return link.length <= 200 && FACEBOOK_LINK.test(link);
}

// Error message for a missing or invalid Facebook link, or ''.
export function getContactLinkError(method, link) {
  if (method !== FACEBOOK_CONTACT_METHOD) return '';
  if (!String(link || '').trim()) return 'Paste the link to your Facebook profile so we can message you.';
  if (!isFacebookLink(link)) return 'Enter a Facebook profile link, like https://www.facebook.com/your.name';
  return '';
}

const EMAIL_FORMAT = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MOBILE_FORMAT = /^09\d{9}$/;

// Email and mobile number are optional, but the method the guest prefers must
// be filled in, and anything entered must be valid. Returns one message per
// field ('' when fine).
export function getContactFieldErrors({ preferredContactMethod, email, phone, contactLink } = {}) {
  const cleanEmail = String(email || '').trim();
  const cleanPhone = String(phone || '').trim();
  const errors = { preferredContactMethod: '', email: '', phone: '', contactLink: '' };
  if (!isPreferredContactMethod(preferredContactMethod)) errors.preferredContactMethod = 'Choose how we should contact you.';
  if (cleanEmail && (!EMAIL_FORMAT.test(cleanEmail) || cleanEmail.length > 254)) errors.email = 'Enter a valid email address, like juan@email.com.';
  else if (!cleanEmail && preferredContactMethod === 'Email') errors.email = 'Enter your email address, since you chose Email.';
  if (cleanPhone && !MOBILE_FORMAT.test(cleanPhone)) errors.phone = 'Enter an 11-digit mobile number starting with 09.';
  else if (!cleanPhone && preferredContactMethod === 'Phone') errors.phone = 'Enter your mobile number, since you chose Phone.';
  errors.contactLink = getContactLinkError(preferredContactMethod, contactLink);
  return errors;
}

// The first contact problem, or ''.
export function getContactDetailsError(fields) {
  const errors = getContactFieldErrors(fields);
  return errors.preferredContactMethod || errors.email || errors.phone || errors.contactLink;
}
