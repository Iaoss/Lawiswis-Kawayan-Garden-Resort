// Senior citizen / PWD discount requested online.
//
//   { action: 'upload', reservationId, token, index, entry }
//     Guest: sends one ID (details and photo) for their new booking. The
//     one-time token proves it is the guest who just made the booking.
//   { action: 'view', reservationId }          Staff: the IDs to check.
//   { action: 'approve', reservationId, checkMethod, checked: true }
//     Staff: applies the discounts and sends the guest a payment link.
//   { action: 'reject', reservationId, reason }
//     Staff: no discount; the guest gets a link for the regular amount.
//
// ID photos can only be read through this server route, and are deleted as
// soon as staff decide.
import crypto from 'crypto';
import { adminDb, FieldValue } from '../lib/firebaseAdmin';
import { verifyStaff } from '../lib/verifyStaff';
import { logActivity } from '../lib/activityLog';
import { sendDiscountDecisionEmail } from '../lib/email';
import { createPayMongoCheckoutSession } from '../lib/paymongoCheckout';
import { getResortNow } from '../src/lib/bookingPricing';
import { ID_PHOTO_COLLECTION, normalizeDiscountId } from '../src/lib/discountReview';
import { getDiscountIdError, normalizeIdNumber } from '../src/lib/seniorPwdDiscount';
import { applyDiscount } from './staff-billing';

class ReviewError extends Error {
  constructor(status, message) {
    super(message);
    this.httpStatus = status;
  }
}

const sha256 = value => crypto.createHash('sha256').update(String(value)).digest('hex');
const sameHash = (a, b) => a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
const money = value => Math.round(Number(value || 0) * 100) / 100;
const uploadRef = (reservationId, index) => adminDb.collection(ID_PHOTO_COLLECTION).doc(`${reservationId}_${index}`);
const bookingRefOf = reservationId => reservationId.slice(0, 8).toUpperCase();

async function uploadId({ reservationId, token, index, entry }) {
  const ref = adminDb.collection('reservations').doc(reservationId);
  const today = getResortNow().dateKey;
  return adminDb.runTransaction(async transaction => {
    const snap = await transaction.get(ref);
    const review = snap.exists ? snap.data().discountReview : null;
    if (!review?.tokenHash || !sameHash(review.tokenHash, sha256(token || ''))) throw new ReviewError(403, 'This ID upload link is not valid.');
    if (review.status !== 'uploading') throw new ReviewError(409, 'The IDs for this booking were already submitted.');
    const kinds = Array.isArray(review.kinds) ? review.kinds : [];
    if (!Number.isInteger(index) || index < 0 || index >= kinds.length) throw new ReviewError(400, 'This ID does not belong to the booking.');
    const checked = normalizeDiscountId(entry, kinds[index], today);
    if (checked.error) throw new ReviewError(400, checked.error);
    const uploaded = [...new Set([...(review.uploaded || []), index])];
    const complete = uploaded.length === kinds.length;
    transaction.set(uploadRef(reservationId, index), { reservationId, index, ...checked.value, createdAt: FieldValue.serverTimestamp() });
    transaction.update(ref, {
      'discountReview.uploaded': uploaded,
      'discountReview.holders': { ...(review.holders || {}), [index]: checked.value.holderName },
      ...(complete ? {
        'discountReview.status': 'pending',
        'discountReview.submittedAt': new Date().toISOString(),
        'discountReview.tokenHash': FieldValue.delete(),
      } : {}),
    });
    return { uploaded: uploaded.length, total: kinds.length, complete };
  });
}

async function loadReview(reservationId) {
  const ref = adminDb.collection('reservations').doc(reservationId);
  const snap = await ref.get();
  if (!snap.exists) throw new ReviewError(404, 'This booking could not be found.');
  const reservation = snap.data();
  if (reservation.discountReview?.status !== 'pending') throw new ReviewError(409, 'This booking has no IDs waiting for review.');
  if (String(reservation.status).toLowerCase() !== 'pending') throw new ReviewError(409, 'This booking is no longer pending.');
  const refs = (reservation.discountReview.kinds || []).map((_, index) => uploadRef(reservationId, index));
  const docs = refs.length ? await adminDb.getAll(...refs) : [];
  const ids = docs.filter(doc => doc.exists).map(doc => doc.data());
  return { ref, reservation, ids, refs };
}

// Makes the payment link, saves the decision, deletes the ID photos and tells
// the guest. If there is no email, staff pass the link on themselves.
async function finishReview({ ref, reservationId, refs, staff, approved, reason, siteUrl }) {
  const reservation = (await ref.get()).data();
  const amount = money(Number(reservation.totalAmount || 0) + Number(reservation.extraCharges || 0) - Number(reservation.amountPaid || 0));
  if (amount <= 0) throw new ReviewError(409, 'This booking has no balance left to pay.');
  const session = await createPayMongoCheckoutSession({
    reservationId,
    amount,
    guestName: reservation.guestName || 'Guest',
    guestEmail: reservation.email || '',
    description: `Room ${reservation.roomNumber || ''} (${reservation.roomType || ''})${approved ? ' — Senior / PWD discount applied' : ''}`,
    paymentType: 'booking',
    paymentChoice: 'full',
    siteUrl,
    withQr: true,
  });
  const decidedAt = new Date().toISOString();
  const batch = adminDb.batch();
  batch.update(ref, {
    'discountReview.status': approved ? 'approved' : 'rejected',
    'discountReview.decidedAt': decidedAt,
    'discountReview.decidedByName': staff.name || staff.email || '',
    'discountReview.reason': approved ? '' : reason,
    'discountReview.paymentAmount': amount,
    'discountReview.paymentUrl': session.checkoutUrl,
    lastCheckoutSession: { id: session.checkoutSessionId, amount, type: 'booking', createdAt: decidedAt },
    'unpaidFollowUp.paymentLinkSentAt': FieldValue.serverTimestamp(),
    'unpaidFollowUp.paymentLinkSentByName': staff.name || staff.email || '',
    'unpaidFollowUp.paymentLinkAmount': amount,
    'unpaidFollowUp.paymentLinkChoice': 'full',
    'unpaidFollowUp.paymentLinkUrl': session.checkoutUrl,
  });
  refs.forEach(item => batch.delete(item));
  await batch.commit();

  let emailed = false;
  let emailError = '';
  if (reservation.email) {
    try {
      await sendDiscountDecisionEmail({ reservation, bookingRef: bookingRefOf(reservationId), approved, reason, amount, paymentUrl: session.checkoutUrl });
      emailed = true;
    } catch (error) {
      console.error('Discount decision email failed:', error);
      emailError = 'The email could not be sent. Please send the link to the guest.';
    }
  }
  return {
    status: approved ? 'approved' : 'rejected',
    amount,
    paymentUrl: session.checkoutUrl,
    emailed,
    emailError,
    contact: {
      method: reservation.preferredContactMethod || '',
      phone: reservation.phone || '',
      email: reservation.email || '',
      link: reservation.contactLink || '',
    },
  };
}

async function approve({ reservationId, staff, checkMethod, checked, siteUrl }) {
  const { ref, reservation, ids, refs } = await loadReview(reservationId);
  if (ids.length !== refs.length) throw new ReviewError(409, 'An ID photo is missing. Reject the request or ask the guest to bring the ID.');
  const today = getResortNow().dateKey;
  // Check every ID first, so nothing is applied when one of them is wrong.
  for (const id of ids) {
    const problem = getDiscountIdError({ ...id, today, checked, checkMethod: checkMethod || '' });
    if (problem) throw new ReviewError(400, `${id.holderName}: ${problem}`);
  }
  const done = new Set(reservation.discountIdNumbers || []);
  for (const id of ids) {
    if (done.has(normalizeIdNumber(id.idNumber))) continue; // applied by an earlier try
    await applyDiscount({
      staff, reservationId, kind: id.kind, idNumber: id.idNumber, holderName: id.holderName,
      birthDate: id.birthDate, expiryDate: id.expiryDate, qualifiedGuests: 1, checked: true, checkMethod,
    });
  }
  return finishReview({ ref, reservationId, refs, staff, approved: true, reason: '', siteUrl });
}

async function reject({ reservationId, staff, reason, siteUrl }) {
  const text = String(reason || '').trim().slice(0, 300);
  if (text.length < 3) throw new ReviewError(400, 'Tell the guest why the ID was not accepted.');
  const { ref, refs } = await loadReview(reservationId);
  return finishReview({ ref, reservationId, refs, staff, approved: false, reason: text, siteUrl });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: 'Method not allowed.' });
  }
  if (!adminDb) return res.status(503).json({ error: 'This service is unavailable.' });
  const { action, reservationId } = req.body || {};
  if (typeof reservationId !== 'string' || !/^[A-Za-z0-9]{5,60}$/.test(reservationId)) {
    return res.status(400).json({ error: 'A booking is required.' });
  }
  try {
    if (action === 'upload') {
      return res.status(200).json(await uploadId({ reservationId, token: req.body.token, index: req.body.index, entry: req.body.entry }));
    }
    const staff = await verifyStaff(req);
    if (!staff) return res.status(401).json({ error: 'Not authorized.' });
    const siteUrl = process.env.PUBLIC_SITE_URL || `https://${req.headers.host}`;
    const ref = `#${bookingRefOf(reservationId)}`;
    if (action === 'view') {
      const { ids } = await loadReview(reservationId);
      await logActivity(staff, { action: 'discount_ids_viewed', summary: `Viewed the Senior / PWD IDs for booking ${ref}`, reservationId });
      return res.status(200).json({ ids: ids.map(({ index, kind, holderName, idNumber, birthDate, expiryDate, photo }) => ({ index, kind, holderName, idNumber, birthDate, expiryDate, photo })) });
    }
    if (action === 'approve') {
      const result = await approve({ reservationId, staff, checkMethod: req.body.checkMethod, checked: req.body.checked === true, siteUrl });
      await logActivity(staff, { action: 'discount_ids_approved', summary: `Approved the Senior / PWD IDs for booking ${ref}; payment link ₱${result.amount.toLocaleString()}`, reservationId });
      return res.status(200).json(result);
    }
    if (action === 'reject') {
      const result = await reject({ reservationId, staff, reason: req.body.reason, siteUrl });
      await logActivity(staff, { action: 'discount_ids_rejected', summary: `Rejected the Senior / PWD IDs for booking ${ref}`, reservationId });
      return res.status(200).json(result);
    }
    return res.status(400).json({ error: 'Choose a valid action.' });
  } catch (error) {
    if (error.httpStatus) return res.status(error.httpStatus).json({ error: error.message });
    console.error('Discount review failed:', error);
    return res.status(500).json({ error: error.message || 'The request could not be completed.' });
  }
}
