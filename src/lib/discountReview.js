// Senior citizen / PWD discount requested during online booking.
//
//   1. The guest submits each ID (details and a photo) with the booking.
//   2. The booking stays unpaid and keeps its room while staff check the IDs.
//   3. Staff approve or reject. The guest is told, with a payment link for
//      the discounted (or, if rejected, the regular) amount.
//
// ID photos are kept in their own collection that only the server can read,
// and are deleted as soon as staff decide.
import { getDiscountIdError } from './seniorPwdDiscount';

export const MAX_DISCOUNT_IDS = 6;
export const MAX_ID_PHOTO_CHARS = 950000; // about 700 KB, a resized phone photo
export const DISCOUNT_REVIEW_HOLD_HOURS = 48;
export const ID_PHOTO_COLLECTION = 'discountIdUploads';
const ID_PHOTO = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/;

export const discountReviewStatus = reservation => String(reservation?.discountReview?.status || '');
export const isAwaitingDiscountReview = reservation => ['uploading', 'pending'].includes(discountReviewStatus(reservation));
export const isDiscountReviewQueued = reservation => discountReviewStatus(reservation) === 'pending'
  && String(reservation?.status || '').toLowerCase() === 'pending';

// One entry per qualified guest: ['senior', 'pwd', ...].
export function discountKindsFor({ senior = 0, pwd = 0 } = {}) {
  return [...Array(Number(senior) || 0).fill('senior'), ...Array(Number(pwd) || 0).fill('pwd')];
}

// The ID details a guest typed. Returns the problem, or ''.
export function getGuestIdError(entry = {}, today = '') {
  return getDiscountIdError({ ...entry, today, checked: true, checkMethod: undefined });
}

// Checks one submitted ID. Returns { error } or { value }.
export function normalizeDiscountId(entry = {}, kind, today) {
  const value = {
    kind,
    holderName: String(entry.holderName || '').trim().replace(/\s+/g, ' ').slice(0, 80),
    idNumber: String(entry.idNumber || '').trim().slice(0, 40),
    birthDate: kind === 'senior' ? String(entry.birthDate || '').slice(0, 10) : '',
    expiryDate: kind === 'pwd' ? String(entry.expiryDate || '').slice(0, 10) : '',
  };
  const error = getGuestIdError(value, today);
  if (error) return { error };
  const photo = String(entry.photo || '');
  if (!ID_PHOTO.test(photo)) return { error: 'Add a clear JPG or PNG photo of the ID.' };
  if (photo.length > MAX_ID_PHOTO_CHARS) return { error: 'This ID photo is too large. Please use a smaller photo.' };
  return { value: { ...value, photo } };
}
