// Government agency / per diem group bookings ("charge to agency").
//
// Government offices usually can't pay a deposit online. They send a booking
// request, the resort sends a quotation, the agency issues a Purchase Order
// (PO), and pays after the event against the resort's Statement of Account.
//
// On the booking:
//   clientType: 'government' | 'private'
//   chargeToAgency: true            the bill is paid by the agency later
//   agencyBilling: { office, tin, poNumber, perDiemRate, poSavedAt, poSavedBy }
// Once staff save the PO number, the group can check in and check out with
// the balance still open; it shows as "Due from agency" until paid.

export const CLIENT_TYPES = [
  { id: 'private', label: 'Private company / organization' },
  { id: 'government', label: 'Government agency (per diem / charge to agency)' },
];

export const MAX_PER_DIEM = 20000;
const TIN_PATTERN = /^\d{3}-?\d{3}-?\d{3}(-?\d{3,5})?$/;

export const isAgencyBilled = reservation => reservation?.chargeToAgency === true;
export const hasAgencyPo = reservation => Boolean(String(reservation?.agencyBilling?.poNumber || '').trim());
// Agency bookings with a PO can stay at the resort with the bill still open.
export const canStayOnAgencyCredit = reservation => isAgencyBilled(reservation) && hasAgencyPo(reservation);

const clean = (value, max) => (typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, max) : '');

// Cleans the agency details; returns { value } or { error }. All optional
// except what `require` lists.
export function normalizeAgencyDetails(input = {}, { require = [] } = {}) {
  const office = clean(input.office, 120);
  const tin = clean(input.tin, 20);
  const poNumber = clean(input.poNumber, 40);
  const rawPerDiem = input.perDiemRate === '' || input.perDiemRate === null || input.perDiemRate === undefined ? 0 : Number(input.perDiemRate);
  if (tin && !TIN_PATTERN.test(tin)) return { error: 'Enter the agency TIN like 123-456-789-000.' };
  if (poNumber && !/^[A-Za-z0-9][A-Za-z0-9 ./#-]*$/.test(poNumber)) return { error: 'The PO number can only have letters, numbers, spaces and . / # -' };
  if (!Number.isFinite(rawPerDiem) || rawPerDiem < 0 || rawPerDiem > MAX_PER_DIEM) return { error: `Enter a per diem from ₱0 to ₱${MAX_PER_DIEM.toLocaleString()}.` };
  if (require.includes('poNumber') && !poNumber) return { error: 'Enter the agency’s Purchase Order (PO) number.' };
  return { value: { office, tin, poNumber, perDiemRate: Math.round(rawPerDiem) } };
}

// Does the package fit the agency's per diem (per person, per day)?
export function perDiemFit(ratePerGuest, perDiemRate) {
  const rate = Number(ratePerGuest) || 0;
  const budget = Number(perDiemRate) || 0;
  if (!rate || !budget) return null;
  const difference = budget - rate;
  return {
    fits: difference >= 0,
    difference: Math.abs(difference),
    message: difference >= 0
      ? `Fits your per diem: ₱${rate.toLocaleString()} per guest is within ₱${budget.toLocaleString()}.`
      : `₱${Math.abs(difference).toLocaleString()} per guest over your ₱${budget.toLocaleString()} per diem. The resort can adjust the package in your quotation.`,
  };
}

// Short status for staff screens.
export function agencyStatusLabel(reservation) {
  if (!isAgencyBilled(reservation)) return '';
  if (!hasAgencyPo(reservation)) return 'Charge to agency · waiting for PO';
  return `Charge to agency · PO ${reservation.agencyBilling.poNumber}`;
}
