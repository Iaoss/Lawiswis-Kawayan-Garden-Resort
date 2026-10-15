export const PREFERRED_CONTACT_METHODS = [
  'Email',
  'Phone',
  'Viber',
  'Facebook Messenger',
];

export function isPreferredContactMethod(value) {
  return PREFERRED_CONTACT_METHODS.includes(value);
}
