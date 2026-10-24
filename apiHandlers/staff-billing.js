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
//   { action: 'add-service', reservationId, serviceId, hours, persons }
//     Adds a spa session or photoshoot package, priced from the rate card.
//   { action: 'cancel-with-policy', reservationId, reason }
//     Cancels a booking and records the fee and refund from the resort's
//     cancellation policy, calculated here.
//   { action: 'create-walk-in', booking: {...} }
//     Creates a walk-in overnight stay, day tour or night tour, priced here
//     with the same rules as online bookings and checked for double bookings.
//   { action: 'edit-booking', reservationId, changes, preview? }
//     Changes a booking's type, dates or guests and reprices it. With
//     preview: true it only returns the new price.

import crypto from 'crypto';
import { adminDb, FieldValue } from '../lib/firebaseAdmin';
import { verifyStaff } from '../lib/verifyStaff';
import { sendPaymentReceipt } from '../lib/sendPaymentReceipt';
import { NAME_PATTERN, joinGuestName } from '../src/lib/nameValidation';
import { isPreferredContactMethod } from '../src/lib/preferredContactMethods';
import { getCottageFee, stayRangesOverlap } from '../src/lib/bookingPricing';
import { BOOKING_OPTIONS, getBookingOptionId, normalizeBookingDetails, priceBookingDetails } from '../src/lib/bookingDetails';
import { DEFAULT_CANCELLATION_POLICY, getDateChangeBlock, getStaffCancellationFee } from '../src/lib/cancellationPolicy';
import { manilaDateKey } from '../src/lib/reservationStatus';
import { isRoomGuest, priceService } from '../src/lib/services';

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

// Adds a rate-card service (spa, photoshoot package) to the bill. The price
// is worked out here from the service rules; only the choices come from the
// browser (service, hours, people).
async function addService({ staff, reservationId, serviceId, hours, persons }) {
  return adminDb.runTransaction(async transaction => {
    const { ref, reservation } = await getReservation(transaction, reservationId);
    if (['cancelled', 'checked-out'].includes(reservation.status)) {
      throw new BillingError(409, 'Services can only be added to an active booking.');
    }
    const priced = priceService(serviceId, { hours, persons, roomGuest: isRoomGuest(reservation) });
    if (priced.error) throw new BillingError(400, priced.error);
    const charge = money(priced.amount);
    const extraCharges = money(Number(reservation.extraCharges || 0) + charge);
    const total = Number(reservation.totalAmount || 0) + extraCharges;
    transaction.update(ref, {
      extraCharges,
      extraChargeItems: FieldValue.arrayUnion({
        id: crypto.randomUUID(),
        description: priced.description,
        amount: charge,
        serviceId,
        hours: Number(hours) || null,
        persons: Number(persons) || null,
        addedBy: staff.uid,
        addedAt: new Date().toISOString(),
      }),
      paymentStatus: paymentStatusFor(total, Number(reservation.amountPaid || 0)),
    });
    return { amount: charge, description: priced.description, extraCharges, balance: money(total - Number(reservation.amountPaid || 0)) };
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

// True if another active booking holds the room on any of these dates.
// Matches by room id, or by room number for older bookings.
async function roomIsTaken(transaction, { roomId, roomNumber, checkIn, checkOut, ignoreId = '' }) {
  const [byId, byNumber] = await Promise.all([
    transaction.get(adminDb.collection('reservations').where('roomId', '==', roomId)),
    roomNumber
      ? transaction.get(adminDb.collection('reservations').where('roomNumber', '==', roomNumber))
      : Promise.resolve({ docs: [] }),
  ]);
  return [...byId.docs, ...byNumber.docs].some(doc => {
    if (doc.id === ignoreId) return false;
    const r = doc.data();
    if (!isActive(r) || (r.roomId && r.roomId !== roomId) || typeof r.checkIn !== 'string') return false;
    const end = typeof r.checkOut === 'string' && r.checkOut ? r.checkOut.slice(0, 10) : r.checkIn.slice(0, 10);
    return stayRangesOverlap(checkIn, checkOut, r.checkIn.slice(0, 10), end);
  });
}

// Turns the staff form's "overnight / day / night" choice into booking details.
function detailsFromForm(form, options) {
  const option = BOOKING_OPTIONS.find(item => item.id === form.bookingOption) || BOOKING_OPTIONS[0];
  const result = normalizeBookingDetails({
    bookingType: option.bookingType,
    tourPeriod: option.tourPeriod,
    overnightTimeSlot: form.overnightTimeSlot,
    checkInTime: form.checkInTime,
    checkIn: form.checkIn,
    checkOut: form.checkOut,
    adults: Number(form.adults),
    children: Number(form.children || 0),
  }, options);
  if (result.error) throw new BillingError(400, result.error);
  return result.details;
}

async function createWalkIn({ staff, booking = {} }) {
  const firstName = cleanText(booking.firstName, 35);
  const lastName = cleanText(booking.lastName, 35);
  if (!NAME_PATTERN.test(firstName) || !NAME_PATTERN.test(lastName)) {
    throw new BillingError(400, 'Enter a valid first and last name (2-35 letters each).');
  }
  const { roomId } = booking;
  if (typeof roomId !== 'string' || !roomId) throw new BillingError(400, 'Choose a room.');
  if (!isPreferredContactMethod(booking.preferredContactMethod)) throw new BillingError(400, 'Choose a preferred contact method.');
  const paymentMethod = COUNTER_PAYMENT_METHODS.includes(booking.paymentMethod) ? booking.paymentMethod : '';
  const paymentStatus = WALK_IN_PAYMENT_STATUSES.includes(booking.paymentStatus) ? booking.paymentStatus : '';
  if (!paymentMethod || !paymentStatus) throw new BillingError(400, 'Choose a payment method and payment status.');
  // Optional cottage: only its id comes from the form; the price is looked up here.
  const cottageId = typeof booking.cottageId === 'string' ? booking.cottageId : '';
  const cottageFee = getCottageFee(cottageId);
  if (cottageFee === null) throw new BillingError(400, 'Choose a valid cottage.');
  const today = manilaDateKey();

  const roomRef = adminDb.collection('rooms').doc(roomId);
  const reservationRef = adminDb.collection('reservations').doc();
  const paymentRef = adminDb.collection('payments').doc();
  const guestName = joinGuestName(firstName, lastName);

  const result = await adminDb.runTransaction(async transaction => {
    const roomSnap = await transaction.get(roomRef);
    if (!roomSnap.exists) throw new BillingError(404, 'This room could not be found.');
    const room = roomSnap.data();
    // Same rules as online bookings: tours are single-day, nothing starts
    // after today's check-in time, and the room's guest limit applies.
    const details = detailsFromForm(booking, { room });
    if (blockedRoomStatus(room.status, details.checkIn, today)) throw new BillingError(409, `Room ${room.roomNumber} isn’t available right now.`);
    if (await roomIsTaken(transaction, { roomId, roomNumber: room.roomNumber, checkIn: details.checkIn, checkOut: details.checkOut })) {
      throw new BillingError(409, `Room ${room.roomNumber} was just booked for those dates. Please choose another room.`);
    }

    // Priced exactly like an online booking (room rate + extra guests).
    let pricing;
    try {
      pricing = priceBookingDetails(room, details, { cottageId, cottageFee });
    } catch (error) {
      throw new BillingError(409, error.message || `Room ${room.roomNumber} has no valid rate.`);
    }
    const totalAmount = money(pricing.subtotalAmount);
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
      ...details,
      baseRate: pricing.baseRate,
      baseCapacity: pricing.baseCapacity,
      extraGuestCharge: pricing.extraGuestCharge,
      cottageId,
      cottageFee,
      subtotalAmount: totalAmount,
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
    const arrivesToday = details.checkIn === today;
    if (arrivesToday) transaction.update(roomRef, { status: 'occupied' });
    return { totalAmount, amountPaid, roomNumber: room.roomNumber || '', arrivesToday };
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

const ACTIVE_CHANGE_REQUESTS = ['requested', 'needs_review', 'awaiting_payment', 'awaiting_refund'];

// Staff edit of an existing booking: switch overnight / day tour / night
// tour, move dates, or change guest counts. The server reprices it with the
// same rules as a new booking. With `preview: true` it only returns the new
// price, so staff can see it before saving.
async function editBooking({ staff, reservationId, changes = {}, preview = false }) {
  return adminDb.runTransaction(async transaction => {
    const { ref, reservation } = await getReservation(transaction, reservationId);
    if (!['pending', 'confirmed', 'checked-in'].includes(reservation.status)) {
      throw new BillingError(409, 'Only pending, confirmed or checked-in bookings can be edited.');
    }
    if (reservation.type === 'corporate' || !reservation.roomId) {
      throw new BillingError(409, 'Corporate and group bookings are priced by package and can’t be edited here.');
    }
    if (ACTIVE_CHANGE_REQUESTS.includes(String(reservation.modificationRequest?.status || ''))) {
      throw new BillingError(409, 'This booking has a change request from the guest. Approve or reject it first.');
    }
    const roomRef = adminDb.collection('rooms').doc(reservation.roomId);
    const roomSnap = await transaction.get(roomRef);
    if (!roomSnap.exists) throw new BillingError(404, 'The booked room could not be found.');
    const room = roomSnap.data();

    const details = detailsFromForm({
      bookingOption: changes.bookingOption || getBookingOptionId(reservation),
      overnightTimeSlot: changes.overnightTimeSlot,
      checkInTime: reservation.checkInTime,
      checkIn: changes.checkIn ?? reservation.checkIn,
      checkOut: changes.checkOut ?? reservation.checkOut,
      adults: changes.adults ?? reservation.adults,
      children: changes.children ?? reservation.children ?? 0,
    }, { room, keepStartDate: reservation.checkIn });
    // Policy: dates can't move less than 30 days before arrival or once the
    // stay has started (cancel and rebook instead). Extending or shortening
    // the check-out isn't a date move.
    const dateBlock = getDateChangeBlock({ originalCheckIn: reservation.checkIn, newCheckIn: details.checkIn });
    if (dateBlock) throw new BillingError(409, dateBlock);
    if (await roomIsTaken(transaction, {
      roomId: reservation.roomId, roomNumber: room.roomNumber, checkIn: details.checkIn, checkOut: details.checkOut, ignoreId: reservationId,
    })) {
      throw new BillingError(409, `Room ${room.roomNumber} is already booked for those dates.`);
    }

    let pricing;
    try {
      pricing = priceBookingDetails(room, details, { cottageId: reservation.cottageId || '', cottageFee: Number(reservation.cottageFee || 0) });
    } catch (error) {
      throw new BillingError(409, error.message || 'This room has no valid rate.');
    }
    // Any promo discount already given stays the same amount. Policy:
    // reductions (fewer guests, cheaper type, shorter stay) aren't refunded,
    // so the total never drops below what was booked.
    const discount = Number(reservation.discountAmount || 0);
    const repriced = money(Math.max(0, pricing.subtotalAmount - discount));
    const totalAmount = Math.max(repriced, Number(reservation.totalAmount || 0));
    const extraCharges = Number(reservation.extraCharges || 0);
    const amountPaid = Number(reservation.amountPaid || 0);
    const balance = money(totalAmount + extraCharges - amountPaid);
    const quote = {
      details,
      repricedTotal: repriced,
      noRefundApplied: repriced < Number(reservation.totalAmount || 0),
      oldTotal: Number(reservation.totalAmount || 0),
      totalAmount,
      difference: money(totalAmount - Number(reservation.totalAmount || 0)),
      balance: Math.max(0, balance),
      overpaid: Math.max(0, -balance),
    };
    if (preview) return { preview: true, ...quote };

    transaction.update(ref, {
      ...details,
      baseRate: pricing.baseRate,
      baseCapacity: pricing.baseCapacity,
      extraGuestCharge: pricing.extraGuestCharge,
      subtotalAmount: pricing.subtotalAmount,
      totalAmount,
      paymentStatus: paymentStatusFor(totalAmount + extraCharges, amountPaid),
      editHistory: FieldValue.arrayUnion({
        id: crypto.randomUUID(),
        editedBy: staff.uid,
        editedAt: new Date().toISOString(),
        from: {
          bookingType: reservation.bookingType || '', tourPeriod: reservation.tourPeriod || '',
          checkIn: reservation.checkIn || '', checkOut: reservation.checkOut || '',
          adults: Number(reservation.adults || 0), children: Number(reservation.children || 0),
          totalAmount: Number(reservation.totalAmount || 0),
        },
        to: { ...details, totalAmount },
      }),
    });
    return { saved: true, ...quote };
  });
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
    else if (body.action === 'add-service') result = await addService({ ...body, staff });
    else if (body.action === 'cancel-with-policy') result = await cancelWithPolicy({ ...body, staff });
    else if (body.action === 'create-walk-in') result = await createWalkIn({ staff, booking: body.booking });
    else if (body.action === 'edit-booking') result = await editBooking({ ...body, staff });
    else return res.status(400).json({ error: 'Choose a valid billing action.' });
    return res.status(200).json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof BillingError) return res.status(error.httpStatus).json({ error: error.message });
    console.error('Staff billing action failed:', error);
    return res.status(500).json({ error: 'The change could not be saved. Please try again.' });
  }
}
