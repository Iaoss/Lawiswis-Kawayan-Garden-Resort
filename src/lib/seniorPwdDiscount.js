// Senior citizen and PWD discount (RA 9994 and RA 10754): each qualified
// guest's share of the bill is VAT-free and gets 20% off. A room shared by
// several guests is split evenly; only the qualified guests' shares are
// discounted. Staff must see the physical ID before applying it.
export const DISCOUNT_KINDS = {
  senior: { label: 'Senior citizen', idLabel: 'OSCA / Senior citizen ID no.' },
  pwd: { label: 'PWD', idLabel: 'PWD ID no.' },
};

// Official lookup sites. They can't be shown inside our system (they block
// that), so the form opens them in a window beside it.
export const PWD_VERIFY_URL = 'https://pwd.doh.gov.ph/tbl_pwd_id_verificationlist.php';
export const PHILSYS_VERIFY_URL = 'https://verify.philsys.gov.ph/';

// How staff confirmed the ID is real (saved with the discount).
export const CHECK_METHODS = {
  doh: 'Found in the DOH PWD registry',
  philsys: 'National ID checked on PhilSys',
  office: 'Called the issuing office (OSCA / PDAO)',
  card: 'Looked at the card only',
};

// PWD IDs from the DOH registry look like 13-7404-000-0001234
// (region-province/city-municipality-number). Some LGUs print them without dashes.
const PWD_ID = /^\d{2}-?\d{4}-?\d{3}-?\d{7}$/;

const round2 = n => Math.round(n * 100) / 100;

export function ageOn(birthDate, onDate) {
  const b = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(birthDate || ''));
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(onDate || ''));
  if (!b || !d) return null;
  let age = Number(d[1]) - Number(b[1]);
  if (Number(d[2]) < Number(b[2]) || (d[2] === b[2] && Number(d[3]) < Number(b[3]))) age -= 1;
  return age;
}

// Problems with the ID details, or '' when they look valid.
// checkMethod is optional here (left out in older callers); the server always sends it.
export function getDiscountIdError({ kind, idNumber, holderName, birthDate, expiryDate, today, checked, checkMethod } = {}) {
  if (!DISCOUNT_KINDS[kind]) return 'Choose Senior citizen or PWD.';
  if (String(holderName || '').trim().length < 3) return 'Enter the name printed on the ID.';
  const id = String(idNumber || '').trim();
  if (id.length < 4 || id.length > 40) return 'Enter the ID number printed on the card.';
  if (kind === 'pwd' && !PWD_ID.test(id)) return 'This is not a valid PWD ID number. It should look like 13-7404-000-0001234.';
  if (kind === 'senior') {
    const age = ageOn(birthDate, today);
    if (age === null) return 'Enter the birth date shown on the senior citizen ID.';
    if (age < 60) return `The ID holder is ${age}. The senior citizen discount is for guests 60 and older.`;
  }
  // Expiry is optional (not every ID shows one), but an expired ID is refused.
  if (kind === 'pwd' && expiryDate) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(expiryDate))) return 'Enter a valid expiry date, or leave it blank.';
    if (today && expiryDate < today) return 'This PWD ID has expired. Ask for a valid ID.';
  }
  if (checked !== true) return 'Confirm you checked the physical ID and that the photo matches the guest.';
  if (checkMethod !== undefined && !CHECK_METHODS[checkMethod]) return 'Choose how you checked the ID.';
  return '';
}

// How much one booking's bill goes down.
export function calculateSeniorPwdDiscount({ amount, totalGuests, qualifiedGuests }) {
  const total = Number(amount) || 0;
  const guests = Math.max(1, Math.floor(Number(totalGuests) || 1));
  const qualified = Math.min(guests, Math.max(0, Math.floor(Number(qualifiedGuests) || 0)));
  if (total <= 0 || qualified <= 0) return { share: 0, vatRemoved: 0, discount20: 0, total: 0, qualified, guests };
  const share = (total / guests) * qualified;  // VAT-inclusive
  const net = share / 1.12;                     // VAT removed
  const discount20 = net * 0.2;
  return {
    share: round2(share),
    vatRemoved: round2(share - net),
    discount20: round2(discount20),
    total: round2(share - (net - discount20)),
    qualified,
    guests,
  };
}

// 0314100000003045 → 03-1410-000-0003045 (how the DOH registry writes it).
export function formatPwdId(id) {
  const digits = String(id || '').replace(/\D/g, '');
  return digits.length === 16 ? `${digits.slice(0, 2)}-${digits.slice(2, 6)}-${digits.slice(6, 9)}-${digits.slice(9)}` : String(id || '').trim();
}

export const normalizeIdNumber = id => String(id || '').replace(/[\s-]/g, '').toUpperCase();
