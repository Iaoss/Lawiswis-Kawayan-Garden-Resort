// Government agency / per diem group bookings: "Enjoy now, pay later"
// (charge to agency).
//
// Government offices usually can't pay a deposit online. They send a booking
// request, the resort sends a quotation, the agency issues a Purchase Order
// (PO), and pays after the event against the resort's Statement of Account.
//
// On the booking:
//   clientType: 'government' | 'private'
//   chargeToAgency: true            the bill is paid by the agency later
//   agencyBilling: { office, tin, poNumber, perDiemRate, paymentTermsDays,
//                    poSavedAt, poSavedBy }
// Once staff save the PO number, the group can check in and check out with
// the balance still open; it shows as "Due from agency" until paid. The
// agency pays within paymentTermsDays (30 by default) after check-out;
// after that the bill shows as overdue.
import { getResortNow } from './bookingPricing';

export const CLIENT_TYPES = [
  { id: 'private', label: 'Private company / organization' },
  { id: 'government', label: 'Government agency (enjoy now, pay later)' },
];

export const MAX_PER_DIEM = 20000;
export const PAY_LATER_LABEL = 'Enjoy now, pay later';
export const DEFAULT_PAYMENT_TERMS_DAYS = 30;
export const MAX_PAYMENT_TERMS_DAYS = 90;
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
  const rawTerms = input.paymentTermsDays === '' || input.paymentTermsDays === null || input.paymentTermsDays === undefined ? DEFAULT_PAYMENT_TERMS_DAYS : Number(input.paymentTermsDays);
  if (tin && !TIN_PATTERN.test(tin)) return { error: 'Enter the agency TIN like 123-456-789-000.' };
  if (poNumber && !/^[A-Za-z0-9][A-Za-z0-9 ./#-]*$/.test(poNumber)) return { error: 'The PO number can only have letters, numbers, spaces and . / # -' };
  if (!Number.isFinite(rawPerDiem) || rawPerDiem < 0 || rawPerDiem > MAX_PER_DIEM) return { error: `Enter a per diem from ₱0 to ₱${MAX_PER_DIEM.toLocaleString()}.` };
  if (!Number.isInteger(rawTerms) || rawTerms < 0 || rawTerms > MAX_PAYMENT_TERMS_DAYS) return { error: `Payment terms must be 0 to ${MAX_PAYMENT_TERMS_DAYS} days after check-out.` };
  if (require.includes('poNumber') && !poNumber) return { error: 'Enter the agency’s Purchase Order (PO) number.' };
  return { value: { office, tin, poNumber, perDiemRate: Math.round(rawPerDiem), paymentTermsDays: rawTerms } };
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
  if (!hasAgencyPo(reservation)) return `${PAY_LATER_LABEL} · waiting for PO`;
  return `${PAY_LATER_LABEL} · PO ${reservation.agencyBilling.poNumber}`;
}

const dateKeyOf = value => {
  if (!value) return '';
  if (typeof value === 'string') return /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : '';
  const date = typeof value?.toDate === 'function' ? value.toDate()
    : typeof value?.seconds === 'number' ? new Date(value.seconds * 1000) : new Date(value);
  return Number.isNaN(date.getTime()) ? '' : getResortNow(date).dateKey;
};
const addDays = (key, days) => {
  const date = new Date(`${key}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};
const daysBetween = (fromKey, toKey) => Math.round((Date.parse(`${toKey}T00:00:00Z`) - Date.parse(`${fromKey}T00:00:00Z`)) / 86400000);

export const paymentTermsOf = reservation => {
  const days = Number(reservation?.agencyBilling?.paymentTermsDays);
  return Number.isInteger(days) && days >= 0 && days <= MAX_PAYMENT_TERMS_DAYS ? days : DEFAULT_PAYMENT_TERMS_DAYS;
};

// When the agency has to pay: the payment terms counted from check-out.
// Returns null for bookings that are not paid later. `balance` is what the
// agency still owes; a bill that is paid is never overdue.
export function agencyPaymentDue(reservation, { now = new Date(), balance = null } = {}) {
  if (!isAgencyBilled(reservation)) return null;
  const from = dateKeyOf(reservation.checkOut) || dateKeyOf(reservation.checkIn);
  if (!from) return null;
  const termsDays = paymentTermsOf(reservation);
  const dueDate = addDays(from, termsDays);
  const daysLeft = daysBetween(getResortNow(now).dateKey, dueDate);
  const owes = balance === null ? true : Number(balance) > 0;
  return { termsDays, dueDate, daysLeft, overdue: owes && daysLeft < 0, paid: !owes };
}

export const formatDueDate = key => (key
  ? new Date(`${key}T00:00:00`).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
  : '');

// One line for staff: "Due Dec 10, 2026 (12 days left)" / "Overdue by 3 days".
export function agencyDueText(due) {
  if (!due) return '';
  if (due.paid) return 'Paid';
  if (due.overdue) return `Overdue by ${-due.daysLeft} day${due.daysLeft === -1 ? '' : 's'} (was due ${formatDueDate(due.dueDate)})`;
  if (due.daysLeft === 0) return `Due today (${formatDueDate(due.dueDate)})`;
  return `Due ${formatDueDate(due.dueDate)} (${due.daysLeft} day${due.daysLeft === 1 ? '' : 's'} left)`;
}
