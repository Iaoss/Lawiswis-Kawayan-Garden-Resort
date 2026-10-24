// POST /api/staff-billing
//
// Staff-only endpoint for everything that changes money on a reservation.
// It runs on the server so amounts can't be edited in the browser; the
// Firestore rules block these writes from the browser entirely.
//
//   { action: 'record-payment', reservationId, amount, method }
//     Records a counter payment (cash, GCash, card, bank). The amount can't
//     be more than the guest still owes. A receipt is emailed.
//   { action: 'add-charge', reservationId, amount, description }
//     Adds an extra charge (minibar, damage, etc.) to the guest's bill.
//   { action: 'cancel-with-policy', reservationId, reason }
//     Cancels a booking and records the fee and refund from the resort's
//     cancellation policy, calculated here.
//   { action: 'create-walk-in', booking: {...} }
//     Creates a walk-in reservation. The price is calculated here from the
//     room's nightly rate, and the room is checked for double bookings.

import crypto from 'crypto';
import { adminDb, FieldValue } from '../lib/firebaseAdmin';
import { verifyStaff } from '../lib/verifyStaff';
import { sendPaymentReceipt } from '../lib/sendPaymentReceipt';
import { NAME_PATTERN, joinGuestName } from '../src/lib/nameValidation';
import { isPreferredContactMethod } from '../src/lib/preferredContactMethods';
import {
  getRoomMaximumGuests,
  getStayDurationError,
  isCoupleRoom,
  stayRangesOverlap,
} from '../src/lib/bookingPricing';
import { DEFAULT_CANCELLATION_POLICY, getStaffCancellationFee } from '../src/lib/cancellationPolicy';
import { manilaDateKey } from '../src/lib/reservationStatus';

export const COUNTER_PAYMENT_METHODS = ['cash', 'gcash', 'card', 'bank', 'online'];
const WALK_IN_PAYMENT_STATUSES = ['paid', 'partial', 'pending'];
const MAX_CHARGE = 100000;

class BillingError extends Error {
  constructor(status, message) {
    super(message);
    this.httpStatus = status;
  }
}

const money = value => Math.round(Number(value) * 100) / 100;
const cleanText = (value, max) => (typeof value === 'string' ? value.trim().slice(0, max) : '');
const owed = r => money(Number(r.totalAmount || 0) + Number(r.extraCharges || 0) - Number(r.amountPaid || 0));

function paymentStatusFor(total, paid) {
  if (Math.round(paid * 100) >= Math.round(total * 100)) return 'paid';
  return paid > 0 ? 'partial' : 'pending';
}

async function getReservation(transaction, reservationId) {
  if (typeof reservationId !== 'string' || !reservationId) throw new BillingError(400, 'A reservation is required.');
  const ref = adminDb.collection('reservations').doc(reservationId);
  const snapshot = await transaction.get(ref);
  if (!snapshot.exists) throw new BillingError(404, 'This reservation could not be found.');
  return { ref, reservation: snapshot.data() };
}

async function recordPayment({ staff, reservationId, amount, method }) {
  const paid = money(amount);
  if (!Number.isFinite(paid) || paid <= 0) throw new BillingError(400, 'Enter a payment amount greater than zero.');
  if (!COUNTER_PAYMENT_METHODS.includes(method)) throw new BillingError(400, 'Choose a valid payment method.');
  const paymentRef = adminDb.collection('payments').doc();

  const result = await adminDb.runTransaction(async transaction => {
    const { ref, reservation } = await getReservation(transaction, reservationId);
    if (reservation.status === 'cancelled') throw new BillingError(409, 'Payments can’t be recorded on a cancelled booking.');
    const balance = owed(reservation);
    if (balance <= 0) throw new BillingError(409, 'This reservation has no balance left to pay.');
    if (paid - balance > 0.001) {
      throw new BillingError(400, `The guest only owes ₱${balance.toLocaleString()}. Enter that amount or less.`);
    }
    const amountPaid = money(Number(reservation.amountPaid || 0) + paid);
    const total = Number(reservation.totalAmount || 0) + Number(reservation.extraCharges || 0);
    const paymentStatus = paymentStatusFor(total, amountPaid);
    transaction.update(ref, { amountPaid, paymentStatus });
    transaction.set(paymentRef, {
      reservationId,
      guestName: reservation.guestName || '',
      roomNumber: reservation.roomNumber || '',
      amount: paid,
      method,
      recordedBy: staff.uid,
      createdAt: FieldValue.serverTimestamp(),
    });
    return { amountPaid, paymentStatus, balance: money(total - amountPaid) };
  });

  let receipt = null;
  let receiptError = '';
  try {
    receipt = await sendPaymentReceipt(adminDb, FieldValue, paymentRef.id);
  } catch (error) {
    receiptError = error.message || 'Receipt email failed to send.';
  }
  return { ...result, paymentId: paymentRef.id, receipt, receiptError };
}

async function addCharge({ staff, reservationId, amount, description }) {
  const charge = money(amount);
  const label = cleanText(description, 200);
  if (!label) throw new BillingError(400, 'Describe the extra charge.');
  if (!Number.isFinite(charge) || charge <= 0 || charge > MAX_CHARGE) {
    throw new BillingError(400, `Enter a charge between ₱1 and ₱${MAX_CHARGE.toLocaleString()}.`);
  }
  return adminDb.runTransaction(async transaction => {
    const { ref, reservation } = await getReservation(transaction, reservationId);
    if (['cancelled', 'checked-out'].includes(reservation.status)) {
      throw new BillingError(409, 'Charges can only be added to an active booking.');
    }
    const extraCharges = money(Number(reservation.extraCharges || 0) + charge);
    const total = Number(reservation.totalAmount || 0) + extraCharges;
    transaction.update(ref, {
      extraCharges,
      extraChargeItems: FieldValue.arrayUnion({
        id: crypto.randomUUID(),
        description: label,
        amount: charge,
        addedBy: staff.uid,
        addedAt: new Date().toISOString(),
      }),
      paymentStatus: paymentStatusFor(total, Number(reservation.amountPaid || 0)),
    });
    return { extraCharges, balance: money(total - Number(reservation.amountPaid || 0)) };
  });
}

async function cancelWithPolicy({ staff, reservationId, reason }) {
  const policySnap = await adminDb.doc('settings/cancellationPolicy').get();
  const policy = policySnap.exists ? policySnap.data() : DEFAULT_CANCELLATION_POLICY;
  return adminDb.runTransaction(async transaction => {
    const { ref, reservation } = await getReservation(transaction, reservationId);
    if (['cancelled', 'checked-out'].includes(reservation.status)) {
      throw new BillingError(409, 'This booking is already cancelled or checked out.');
    }
    const outcome = getStaffCancellationFee({ policy, checkIn: reservation.checkIn, totalAmount: reservation.totalAmount });
    if (!outcome) throw new BillingError(409, 'This booking’s check-in date or total is invalid, so the fee can’t be calculated.');
    const roomRef = reservation.roomId ? adminDb.collection('rooms').doc(reservation.roomId) : null;
    const roomSnap = roomRef ? await transaction.get(roomRef) : null;
    transaction.update(ref, {
      status: 'cancelled',
      cancellationRequested: false,
      cancellationReason: cleanText(reason, 500),
      cancellationFee: outcome.fee,
      refundAmount: outcome.refund,
      cancelledAt: new Date().toISOString(),
      cancelledBy: staff.uid,
      statusUpdatedAt: FieldValue.serverTimestamp(),
      statusUpdatedBy: staff.uid,
    });
    if (roomSnap?.exists) transaction.update(roomRef, { status: 'vacant' });
    return { fee: outcome.fee, refund: outcome.refund, rate: outcome.rate };
  });
}

const isActive = r => !['cancelled', 'checked-out'].includes(String(r.status || '').toLowerCase());
const blockedRoomStatus = (status, checkIn, today) => {
  const value = String(status || '').toLowerCase();
  if (/maint|out.?of.?(service|order)|blocked|closed/.test(value)) return true;
  return value === 'cleaning' && checkIn === today; // cleaning only matters for same-day arrivals
};

async function createWalkIn({ staff, booking = {} }) {
  const firstName = cleanText(booking.firstName, 35);
  const lastName = cleanText(booking.lastName, 35);
  if (!NAME_PATTERN.test(firstName) || !NAME_PATTERN.test(lastName)) {
    throw new BillingError(400, 'Enter a valid first and last name (2-35 letters each).');
  }
  const { roomId, checkIn, checkOut } = booking;
  const adults = Number(booking.adults);
  const children = Number(booking.children);
  if (typeof roomId !== 'string' || !roomId) throw new BillingError(400, 'Choose a room.');
  if (typeof checkIn !== 'string' || typeof checkOut !== 'string') throw new BillingError(400, 'Choose check-in and check-out dates.');
  const stayError = getStayDurationError(checkIn, checkOut);
  if (stayError) throw new BillingError(400, stayError);
  const today = manilaDateKey();
  if (checkIn < today) throw new BillingError(400, 'Check-in can’t be in the past.');
  if (!Number.isInteger(adults) || adults < 1 || !Number.isInteger(children) || children < 0) {
    throw new BillingError(400, 'Guest counts must be whole numbers.');
  }
  if (!isPreferredContactMethod(booking.preferredContactMethod)) throw new BillingError(400, 'Choose a preferred contact method.');
  const paymentMethod = COUNTER_PAYMENT_METHODS.includes(booking.paymentMethod) ? booking.paymentMethod : '';
  const paymentStatus = WALK_IN_PAYMENT_STATUSES.includes(booking.paymentStatus) ? booking.paymentStatus : '';
  if (!paymentMethod || !paymentStatus) throw new BillingError(400, 'Choose a payment method and payment status.');
  const nights = Math.round((new Date(`${checkOut}T00:00:00Z`) - new Date(`${checkIn}T00:00:00Z`)) / 86400000);

  const roomRef = adminDb.collection('rooms').doc(roomId);
  const reservationRef = adminDb.collection('reservations').doc();
  const paymentRef = adminDb.collection('payments').doc();
  const guestName = joinGuestName(firstName, lastName);

  const result = await adminDb.runTransaction(async transaction => {
    const roomSnap = await transaction.get(roomRef);
    if (!roomSnap.exists) throw new BillingError(404, 'This room could not be found.');
    const room = roomSnap.data();
    if (blockedRoomStatus(room.status, checkIn, today)) throw new BillingError(409, `Room ${room.roomNumber} isn’t available right now.`);
    if (isCoupleRoom(room) && adults + children > getRoomMaximumGuests(room)) {
      throw new BillingError(400, 'Couple Room accommodates a maximum of 1 extra adult or child. For larger groups, book the Family Suite for 6.');
    }
    // Double-booking guard: match by room id, or by room number for older bookings.
    const [byId, byNumber] = await Promise.all([
      transaction.get(adminDb.collection('reservations').where('roomId', '==', roomId)),
      room.roomNumber
        ? transaction.get(adminDb.collection('reservations').where('roomNumber', '==', room.roomNumber))
        : Promise.resolve({ docs: [] }),
    ]);
    const clash = [...byId.docs, ...byNumber.docs].some(doc => {
      const r = doc.data();
      if (!isActive(r) || (r.roomId && r.roomId !== roomId) || typeof r.checkIn !== 'string') return false;
      const end = typeof r.checkOut === 'string' && r.checkOut ? r.checkOut.slice(0, 10) : r.checkIn.slice(0, 10);
      return stayRangesOverlap(checkIn, checkOut, r.checkIn.slice(0, 10), end);
    });
    if (clash) throw new BillingError(409, `Room ${room.roomNumber} was just booked for those dates. Please choose another room.`);

    const rate = Number(room.price);
    if (!Number.isFinite(rate) || rate <= 0) throw new BillingError(409, `Room ${room.roomNumber} has no nightly rate set.`);
    const totalAmount = money(rate * nights);
    const amountPaid = paymentStatus === 'paid' ? totalAmount : 0;

    transaction.set(reservationRef, {
      firstName,
      lastName,
      guestName,
      email: cleanText(booking.email, 120),
      phone: cleanText(booking.phone, 20),
      address: cleanText(booking.address, 300),
      preferredContactMethod: booking.preferredContactMethod,
      notes: cleanText(booking.notes, 1000),
      roomId,
      roomNumber: room.roomNumber || '',
      roomType: room.type || '',
      category: cleanText(booking.category, 80),
      checkIn,
      checkOut,
      adults,
      children,
      nights,
      totalAmount,
      amountPaid,
      paymentMethod,
      paymentStatus,
      type: 'walk-in',
      status: 'confirmed',
      createdBy: staff.uid,
      createdAt: FieldValue.serverTimestamp(),
    });
    if (amountPaid > 0) {
      transaction.set(paymentRef, {
        reservationId: reservationRef.id,
        guestName,
        roomNumber: room.roomNumber || '',
        amount: amountPaid,
        method: paymentMethod,
        recordedBy: staff.uid,
        createdAt: FieldValue.serverTimestamp(),
      });
    }
    // Only mark the room occupied when the guest arrives today.
    if (checkIn === today) transaction.update(roomRef, { status: 'occupied' });
    return { totalAmount, amountPaid, roomNumber: room.roomNumber || '', arrivesToday: checkIn === today };
  });

  let receipt = null;
  let receiptError = '';
  if (result.amountPaid > 0) {
    try {
      receipt = await sendPaymentReceipt(adminDb, FieldValue, paymentRef.id);
    } catch (error) {
      receiptError = error.message || 'Receipt email failed to send.';
    }
  }
  return { ...result, reservationId: reservationRef.id, receipt, receiptError };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: 'Method not allowed.' });
  }
  const staff = await verifyStaff(req);
  if (!staff) return res.status(401).json({ error: 'Not authorized.' });
  if (!adminDb) return res.status(503).json({ error: 'Billing service is unavailable.' });

  const body = req.body || {};
  try {
    let result;
    if (body.action === 'record-payment') result = await recordPayment({ ...body, staff });
    else if (body.action === 'add-charge') result = await addCharge({ ...body, staff });
    else if (body.action === 'cancel-with-policy') result = await cancelWithPolicy({ ...body, staff });
    else if (body.action === 'create-walk-in') result = await createWalkIn({ staff, booking: body.booking });
    else return res.status(400).json({ error: 'Choose a valid billing action.' });
    return res.status(200).json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof BillingError) return res.status(error.httpStatus).json({ error: error.message });
    console.error('Staff billing action failed:', error);
    return res.status(500).json({ error: 'The change could not be saved. Please try again.' });
  }
}
