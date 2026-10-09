export const NAME_PATTERN = /^[A-Za-zÀ-ÖØ-öø-ÿ\s'-]{2,35}$/;
export const NAME_ALLOWED_CHARACTERS = /^[A-Za-zÀ-ÖØ-öø-ÿ\s'-]*$/;

export function splitGuestName(fullName = '') {
  const parts = String(fullName).trim().split(/\s+/).filter(Boolean);
  return {
    firstName: parts.shift() || '',
    lastName: parts.join(' '),
  };
}

export function joinGuestName(firstName = '', lastName = '') {
  return `${String(firstName).trim()} ${String(lastName).trim()}`.trim();
}
