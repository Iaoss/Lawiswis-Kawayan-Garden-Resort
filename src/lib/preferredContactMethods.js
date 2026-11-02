// How a guest wants the resort to reach them. Email and Phone use the
// details already on the booking form; Facebook Messenger needs the guest's
// Facebook profile link.
export const PREFERRED_CONTACT_METHODS = [
  'Email',
  'Phone',
  'Facebook Messenger',
];

export const FACEBOOK_CONTACT_METHOD = 'Facebook Messenger';

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
