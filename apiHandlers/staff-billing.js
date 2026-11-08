// POST /api/staff-billing
//
// Staff-only endpoint for everything that changes money on a reservation.
// It runs on the server so amounts can't be edited in the browser; the
// Firestore rules block these writes from the browser entirely.
//
//   { action: 'record-payment', reservationId, amount, method, officialReceiptNo? }
//     Records a counter payment (cash, GCash, card, bank). The amount can't
//     be more than the guest still owes. A receipt is emailed. If the desk
//     also wrote a paper receipt, its number is saved with the payment.
//   { action: 'add-charge', reservationId, amount, description }
//     Adds an extra charge (minibar, damage, etc.) to the guest's bill.
//   { action: 'add-service', reservationId, serviceId, hours, persons }
//     Adds a spa session or photoshoot package, priced from the rate card.
//   { action: 'cancel-with-policy', reservationId, reason, preview? }
//     Cancels a booking and records the fee and refund from the resort's
//     cancellation policy, calculated here, then emails the guest a
//     cancellation notice with a receipt. With preview: true it only returns
//     the fee and refund. Receptionists need the admin's "Cancel bookings"
//     access.
//   { action: 'create-walk-in', booking: {...} }
//     Creates a walk-in overnight stay, day tour or night tour, priced here
//     with the same rules as online bookings and checked for double bookings.
//   { action: 'edit-booking', reservationId, changes (roomId moves rooms), preview? }
//   { action: 'add-room-to-booking', reservationId, roomId, adults, children, preview? }
//     Changes a booking's type, dates or guests and reprices it. With
//     preview: true it only returns the new price.

import crypto from 'crypto';
import { adminDb, FieldValue } from '../lib/firebaseAdmin';
import { staffCan, verifyStaff } from '../lib/verifyStaff';
import { describeBillingAction, logActivity } from '../lib/activityLog';
import { sendPaymentReceipt } from '../lib/sendPaymentReceipt';
import { CancelError, cancelBooking } from '../lib/cancelBooking';
import { sendClosureNoticeEmail } from '../lib/email';
import { shouldAutoConfirm } from '../lib/recordPayMongoPayment';
import { sendConfirmationEmailOnce } from '../lib/confirmationEmail';
import { NAME_PATTERN, joinGuestName } from '../src/lib/nameValidation';
import { isPreferredContactMethod } from '../src/lib/preferredContactMethods';
import { closedPeriodMessage, findClosedPeriod } from '../src/lib/closedDates';
import { DAYTOUR_TIME_SLOT, NIGHTTOUR_TIME_SLOT, calculateCottageTourPrice, getCottageFee, formatResortClock, getReservationDayVisitors, getRoomMaximumGuests, getWalkInTourCutoffError, isLateArrivalTime, stayRangesOverlap } from '../src/lib/bookingPricing';
import { getCottageAvailabilityFor } from '../lib/cottageStock';
import { cottageAvailabilityError } from '../src/lib/cottages';
import { BOOKING_OPTIONS, getBookingOptionId, normalizeBookingDetails, priceBookingDetails } from '../src/lib/bookingDetails';
import { getDateChangeBlock } from '../src/lib/cancellationPolicy';
import { canAutoCheckIn, manilaDateKey } from '../src/lib/reservationStatus';
import { isRoomGuest, priceService } from '../src/lib/services';
import { holdsRoom } from '../src/lib/unpaidBookings';
import { readSeasonPeriods } from '../lib/seasonStore';
import { MAX_ROOMS_PER_BOOKING, fillBalancesInOrder, getAdditionalRoomsError } from '../src/lib/groupBooking';
import { getRoomChangeError } from '../src/lib/roomChange';
import { CHECK_METHODS, DISCOUNT_KINDS, calculateSeniorPwdDiscount, getDiscountIdError, normalizeIdNumber } from '../src/lib/seniorPwdDiscount';
import { createCorporateReservation } from './create-corporate-reservation';
import { ROOM_BLOCK_TYPE, syncCorporateRoomBlocks } from '../lib/corporateRooms';
import { bookedGuestCount, splitArrivedGuests } from '../src/lib/guestArrivals';

// The resort has no card terminal: guests pay at the counter by cash or QR
// (GCash / QR Ph). 'card' stays accepted only for older bookings.
export const COUNTER_PAYMENT_METHODS = ['cash', 'gcash', 'qrph', 'bank', 'online', 'card'];
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

async function recordPayment({ staff, reservationId, amount, method, officialReceiptNo }) {
  const paperReceiptNo = cleanText(officialReceiptNo, 40);
  const paid = money(amount);
  if (!Number.isFinite(paid) || paid <= 0) throw new BillingError(400, 'Enter a payment amount greater than zero.');
  if (!COUNTER_PAYMENT_METHODS.includes(method)) throw new BillingError(400, 'Choose a valid payment method.');
  const paymentRef = adminDb.collection('payments').doc();

  const result = await adminDb.runTransaction(async transaction => {
    const { ref, reservation } = await getReservation(transaction, reservationId);
    if (reservation.status === 'cancelled') throw new BillingError(409, 'Payments can’t be recorded on a cancelled booking.');
    // Read the room now: a transaction must do all its reads before writing.
    const roomRef = reservation.roomId ? adminDb.collection('rooms').doc(reservation.roomId) : null;
    const roomSnap = roomRef ? await transaction.get(roomRef) : null;
    const balance = owed(reservation);
    if (balance <= 0) throw new BillingError(409, 'This reservation has no balance left to pay.');
    if (paid - balance > 0.001) {
      throw new BillingError(400, `The guest only owes ₱${balance.toLocaleString()}. Enter that amount or less.`);
    }
    const amountPaid = money(Number(reservation.amountPaid || 0) + paid);
    const total = Number(reservation.totalAmount || 0) + Number(reservation.extraCharges || 0);
    const paymentStatus = paymentStatusFor(total, amountPaid);
    // A pending booking is confirmed once at least the deposit is paid,
    // the same rule as online payments.
    // Paid in full on the day of the stay: the guest is checked in, since
    // guests pay before entering the resort.
    const autoCheckedIn = canAutoCheckIn({ ...reservation, amountPaid });
    const autoConfirmed = !autoCheckedIn && shouldAutoConfirm(reservation, {}, amountPaid);
    transaction.update(ref, {
      amountPaid,
      paymentStatus,
      ...(autoConfirmed ? {
        status: 'confirmed',
        autoConfirmedAt: FieldValue.serverTimestamp(),
        statusUpdatedAt: FieldValue.serverTimestamp(),
        statusUpdatedBy: staff.uid,
      } : {}),
      ...(autoCheckedIn ? {
        status: 'checked-in',
        checkedInAt: reservation.checkedInAt || FieldValue.serverTimestamp(),
        autoCheckedInAt: FieldValue.serverTimestamp(),
        statusUpdatedAt: FieldValue.serverTimestamp(),
        statusUpdatedBy: staff.uid,
      } : {}),
    });
    if (autoCheckedIn && roomSnap?.exists) transaction.update(roomRef, { status: 'occupied' });
    // A paid-up corporate group checks in with its assigned rooms.
    if (autoCheckedIn) syncCorporateRoomBlocks(transaction, reservation, 'checked-in');
    transaction.set(paymentRef, {
      reservationId,
      guestName: reservation.guestName || '',
      roomNumber: reservation.roomNumber || '',
      amount: paid,
      method,
      ...(paperReceiptNo ? { officialReceiptNo: paperReceiptNo } : {}),
      recordedBy: staff.uid,
      recordedByName: staff.name || staff.email || '',
      createdAt: FieldValue.serverTimestamp(),
    });
    return { amountPaid, paymentStatus, balance: money(total - amountPaid), autoConfirmed, autoCheckedIn };
  });

  if (result.autoConfirmed) {
    try {
      await sendConfirmationEmailOnce(adminDb, FieldValue, reservationId);
    } catch (error) {
      console.error('Confirmation email after counter payment failed:', error);
    }
  }

  let receipt = null;
  let receiptError = '';
  try {
    receipt = await sendPaymentReceipt(adminDb, FieldValue, paymentRef.id);
  } catch (error) {
    receiptError = error.message || 'Receipt email failed to send.';
  }
  return { ...result, paymentId: paymentRef.id, receipt, receiptError };
}

// Rooms for a corporate / group booking. Staff pick the rooms; each gets a
// 0-peso room block on the group's dates so no one else can book it.
// Sending the full list replaces the previous one.
async function assignCorporateRooms({ staff, reservationId, roomIds }) {
  if (!Array.isArray(roomIds) || roomIds.length > 60 || roomIds.some(id => typeof id !== 'string' || !id)) {
    throw new BillingError(400, 'Choose up to 60 rooms.');
  }
  const wanted = [...new Set(roomIds)];
  return adminDb.runTransaction(async transaction => {
    const { ref, reservation } = await getReservation(transaction, reservationId);
    if (reservation.type !== 'corporate') throw new BillingError(409, 'Rooms can only be assigned to a corporate or group booking.');
    if (!['pending', 'confirmed', 'checked-in'].includes(reservation.status)) throw new BillingError(409, 'This booking is no longer active.');
    const checkIn = String(reservation.checkIn || '').slice(0, 10);
    const checkOut = String(reservation.checkOut || reservation.checkIn || '').slice(0, 10);
    const current = Array.isArray(reservation.assignedRooms) ? reservation.assignedRooms : [];
    const keep = current.filter(item => wanted.includes(item.roomId));
    const remove = current.filter(item => !wanted.includes(item.roomId));
    const addIds = wanted.filter(id => !current.some(item => item.roomId === id));
    // Reads first.
    const added = [];
    for (const roomId of addIds) {
      const roomSnap = await transaction.get(adminDb.collection('rooms').doc(roomId));
      if (!roomSnap.exists) throw new BillingError(404, 'One of the rooms could not be found.');
      const room = roomSnap.data();
      if (await roomIsTaken(transaction, { roomId, roomNumber: room.roomNumber, checkIn, checkOut })) {
        throw new BillingError(409, `Room ${room.roomNumber} is already booked on these dates.`);
      }
      added.push({ roomId, room, ref: adminDb.collection('reservations').doc() });
    }
    remove.forEach(item => { if (item.blockId) transaction.delete(adminDb.collection('reservations').doc(item.blockId)); });
    const groupName = reservation.companyName || reservation.guestName || 'Group';
    added.forEach(({ roomId, room, ref: blockRef }) => {
      transaction.set(blockRef, {
        type: ROOM_BLOCK_TYPE,
        corporateId: ref.id,
        groupId: ref.id,
        roomId,
        roomNumber: room.roomNumber || '',
        roomType: room.type || '',
        guestName: `${groupName} (group)`,
        companyName: reservation.companyName || '',
        checkIn,
        checkOut,
        checkInTime: reservation.checkInTime || '',
        checkOutTime: reservation.checkOutTime || '',
        bookingType: reservation.bookingType || 'corporate',
        status: reservation.status,
        totalAmount: 0,
        amountPaid: 0,
        extraCharges: 0,
        paymentStatus: 'paid',
        paymentMethod: 'corporate',
        notes: `Room for the ${groupName} group (booking #${ref.id.slice(0, 8).toUpperCase()}).`,
        createdBy: staff.uid,
        createdAt: FieldValue.serverTimestamp(),
      });
    });
    const assignedRooms = [
      ...keep,
      ...added.map(({ roomId, room, ref: blockRef }) => ({
        roomId, roomNumber: room.roomNumber || '', roomType: room.type || '',
        maxGuests: getRoomMaximumGuests(room) || null, blockId: blockRef.id,
      })),
    ];
    transaction.update(ref, { assignedRooms, assignedRoomCount: assignedRooms.length, roomsAssignedBy: staff.name || staff.email || staff.uid });
    return { assignedRooms, added: added.length, removed: remove.length, companyName: groupName };
  });
}

// Corporate group booked at the desk (no 7-day notice needed).
async function createCorporateWalkIn({ staff, booking }) {
  const { code, json } = await createCorporateReservation(booking || {}, staff);
  if (code !== 200) throw new BillingError(code, json.error || 'Could not create the group booking.');
  return json;
}

// One desk payment for rooms booked together: fills each room's balance in
// order (first room first), recorded as one payment per room.
async function recordGroupPayment({ staff, reservationId, amount, method, officialReceiptNo }) {
  const paid = money(amount);
  if (!Number.isFinite(paid) || paid <= 0) throw new BillingError(400, 'Enter a payment amount greater than zero.');
  const mainSnap = await adminDb.collection('reservations').doc(reservationId).get();
  if (!mainSnap.exists) throw new BillingError(404, 'This reservation could not be found.');
  const ids = Array.isArray(mainSnap.data().groupReservationIds) && mainSnap.data().groupReservationIds.length
    ? mainSnap.data().groupReservationIds : [reservationId];
  const snaps = await Promise.all(ids.map(id => adminDb.collection('reservations').doc(id).get()));
  const rooms = snaps.filter(snap => snap.exists && snap.data().status !== 'cancelled');
  const balances = rooms.map(snap => owed(snap.data()));
  const totalOwed = money(balances.reduce((a, b) => a + b, 0));
  if (paid - totalOwed > 0.001) throw new BillingError(400, `The group only owes ₱${totalOwed.toLocaleString()}.`);
  const shares = fillBalancesInOrder(paid, balances);
  const results = [];
  for (let i = 0; i < rooms.length; i += 1) {
    if (shares[i] <= 0) continue;
    results.push({ reservationId: rooms[i].id, ...(await recordPayment({ staff, reservationId: rooms[i].id, amount: shares[i], method, officialReceiptNo })) });
  }
  const after = await Promise.all(rooms.map(snap => snap.ref.get()));
  return {
    amountPaid: money(after.reduce((sum, snap) => sum + Number(snap.data().amountPaid || 0), 0)),
    balance: money(after.reduce((sum, snap) => sum + owed(snap.data()), 0)),
    autoCheckedIn: results.some(item => item.autoCheckedIn),
    receipt: results.some(item => item.receipt) ? { sent: true } : null,
    receiptError: results.map(item => item.receiptError).filter(Boolean).join(' '),
    rooms: results.map(item => ({ reservationId: item.reservationId, autoCheckedIn: item.autoCheckedIn })),
  };
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

// Senior citizen / PWD discount: staff checked the physical ID. The amount
// is worked out here (20% off the VAT-free share of each qualified guest).
// The same ID can't be used twice on one booking or on another booking for
// overlapping dates.
async function applyDiscount({ staff, reservationId, kind, idNumber, holderName, birthDate, expiryDate, qualifiedGuests, checked, checkMethod }) {
  const today = manilaDateKey();
  const idError = getDiscountIdError({ kind, idNumber, holderName, birthDate, expiryDate, today, checked, checkMethod: checkMethod || '' });
  if (idError) throw new BillingError(400, idError);
  const normalizedId = normalizeIdNumber(idNumber);
  const sameId = await adminDb.collection('reservations').where('discountIdNumbers', 'array-contains', normalizedId).get();
  return adminDb.runTransaction(async transaction => {
    const { ref, reservation } = await getReservation(transaction, reservationId);
    if (['cancelled', 'checked-out'].includes(reservation.status)) {
      throw new BillingError(409, 'Discounts can only be added to an active booking.');
    }
    const start = String(reservation.checkIn || '').slice(0, 10);
    const end = String(reservation.checkOut || reservation.checkIn || '').slice(0, 10);
    const clash = sameId.docs.find(doc => {
      if (doc.id === ref.id) return true;
      const other = doc.data();
      if (['cancelled'].includes(other.status)) return false;
      return stayRangesOverlap(start, end, String(other.checkIn || '').slice(0, 10), String(other.checkOut || other.checkIn || '').slice(0, 10));
    });
    if (clash) {
      throw new BillingError(409, clash.id === ref.id
        ? 'This ID was already used for a discount on this booking.'
        : `This ID is already used on booking #${clash.id.slice(0, 8).toUpperCase()} for the same dates. One ID covers one guest only.`);
    }
    const totalGuests = Math.max(1, Number(reservation.totalGuests || 0) || (Number(reservation.adults || 0) + Number(reservation.children || 0)) || 1);
    const usedSlots = (reservation.discounts || []).length;
    const qualified = Math.max(1, Math.floor(Number(qualifiedGuests) || 1));
    if (usedSlots + qualified > totalGuests) throw new BillingError(400, `This booking has ${totalGuests} guest(s); ${usedSlots} already have a discount.`);
    const quote = calculateSeniorPwdDiscount({ amount: reservation.totalAmount, totalGuests, qualifiedGuests: 1 });
    if (quote.total <= 0) throw new BillingError(400, 'There is no booking amount to discount.');
    const label = `${DISCOUNT_KINDS[kind].label} discount (20% + VAT-free) · ${cleanText(holderName, 60)} · ID ${cleanText(idNumber, 40)}`;
    const extraCharges = money(Number(reservation.extraCharges || 0) - quote.total);
    const total = Number(reservation.totalAmount || 0) + extraCharges;
    const record = {
      id: crypto.randomUUID(),
      kind,
      holderName: cleanText(holderName, 80),
      idNumber: cleanText(idNumber, 40),
      ...(kind === 'senior' ? { birthDate: String(birthDate).slice(0, 10) } : { expiryDate: String(expiryDate || '').slice(0, 10) }),
      amount: quote.total,
      vatRemoved: quote.vatRemoved,
      discount20: quote.discount20,
      checkMethod,
      checkMethodLabel: CHECK_METHODS[checkMethod],
      verifiedBy: staff.name || staff.email || staff.uid,
      verifiedByUid: staff.uid,
      verifiedAt: new Date().toISOString(),
    };
    transaction.update(ref, {
      extraCharges,
      extraChargeItems: FieldValue.arrayUnion({ id: record.id, description: label, amount: -quote.total, kind: 'discount', addedBy: staff.uid, addedAt: record.verifiedAt }),
      discounts: FieldValue.arrayUnion(record),
      discountIdNumbers: FieldValue.arrayUnion(normalizedId),
      paymentStatus: paymentStatusFor(total, Number(reservation.amountPaid || 0)),
    });
    return { discount: quote.total, label, extraCharges, balance: money(total - Number(reservation.amountPaid || 0)) };
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

// Customer Management: correct a guest's name and contact details on all of
// their bookings at once. Any staff member; every change is logged.
async function updateGuest({ staff, reservationIds, firstName, lastName, phone, email, address }) {
  const ids = Array.isArray(reservationIds) ? [...new Set(reservationIds.filter(id => typeof id === 'string' && id))].slice(0, 200) : [];
  if (!ids.length) throw new BillingError(400, 'Choose the guest to update.');
  const first = cleanText(firstName, 35);
  const last = cleanText(lastName, 35);
  if (!NAME_PATTERN.test(first) || !NAME_PATTERN.test(last)) throw new BillingError(400, 'Enter a valid first and last name (2–35 letters each).');
  const cleanPhone = cleanText(phone, 20).replace(/\D/g, '');
  if (cleanPhone && !/^09\d{9}$/.test(cleanPhone)) throw new BillingError(400, 'Enter an 11-digit mobile number starting with 09, or leave it empty.');
  const cleanEmail = cleanText(email, 120).toLowerCase();
  if (cleanEmail && !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(cleanEmail)) throw new BillingError(400, 'Enter a valid email address, or leave it empty.');
  const cleanAddress = cleanText(address, 300);
  const guestName = joinGuestName(first, last);

  const batch = adminDb.batch();
  let before = null;
  for (const id of ids) {
    const ref = adminDb.collection('reservations').doc(id);
    const snapshot = await ref.get();
    if (!snapshot.exists) throw new BillingError(404, 'One of this guest’s bookings no longer exists. Refresh the page.');
    if (!before) before = snapshot.data();
    batch.update(ref, {
      firstName: first,
      lastName: last,
      guestName,
      phone: cleanPhone,
      email: cleanEmail,
      emailLower: cleanEmail,
      address: cleanAddress,
      guestInfoUpdatedAt: FieldValue.serverTimestamp(),
      guestInfoUpdatedBy: staff.name || staff.email || '',
    });
  }
  await batch.commit();
  const changed = [
    before?.guestName !== guestName ? `name "${before?.guestName || ''}" → "${guestName}"` : '',
    String(before?.phone || '') !== cleanPhone ? 'phone' : '',
    String(before?.email || '').toLowerCase() !== cleanEmail ? 'email' : '',
    String(before?.address || '') !== cleanAddress ? 'address' : '',
  ].filter(Boolean);
  return { updated: ids.length, guestName, changed };
}

// Resort closure (typhoon, flood): email every listed guest their options
// (new dates or a full refund, no fee). Admin only. Bookings are checked on
// the server: they must be active and overlap the closed dates.
async function sendClosureNotices({ staff, reservationIds, closedFrom, closedTo, reason }) {
  if (staff.role !== 'admin') throw new BillingError(403, 'Only an admin can send closure notices.');
  const dateKey = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateKey.test(String(closedFrom)) || !dateKey.test(String(closedTo)) || closedTo < closedFrom) {
    throw new BillingError(400, 'Choose the dates the resort is closed.');
  }
  const ids = Array.isArray(reservationIds) ? [...new Set(reservationIds.filter(id => typeof id === 'string' && id))].slice(0, 200) : [];
  if (!ids.length) throw new BillingError(400, 'Choose at least one booking.');
  const cleanReason = cleanText(reason, 120);
  let sent = 0;
  const failed = [];
  for (const id of ids) {
    const snapshot = await adminDb.collection('reservations').doc(id).get();
    const reservation = snapshot.data();
    const end = String(reservation?.checkOut || reservation?.checkIn || '').slice(0, 10);
    const affected = reservation && ['pending', 'confirmed'].includes(reservation.status)
      && stayRangesOverlap(closedFrom, closedTo, String(reservation.checkIn).slice(0, 10), end);
    if (!affected || !(reservation.email || reservation.guestEmail)) { failed.push(id); continue; }
    try {
      await sendClosureNoticeEmail({ reservation, bookingRef: id.slice(0, 8).toUpperCase(), reason: cleanReason, closedFrom, closedTo });
      await snapshot.ref.update({ closureNotice: { sentAt: FieldValue.serverTimestamp(), closedFrom, closedTo, reason: cleanReason, sentBy: staff.name || staff.email || '' } });
      sent += 1;
    } catch (error) {
      console.error('Closure notice failed:', id, error);
      failed.push(id);
    }
  }
  return { sent, failed };
}

// Cancel with the policy fee, mark a no-show (noShow: true) or, for admins,
// waive the policy (waive: true, with a reason). See lib/cancelBooking.js.
async function cancelWithPolicy({ staff, reservationId, reason, preview = false, noShow = false, waive = false }) {
  if (staff.role === 'receptionist' && !staffCan(staff, 'cancel')) {
    throw new BillingError(403, 'Receptionists can request a cancellation, but only an admin can cancel.');
  }
  try {
    return await cancelBooking({ actor: staff, reservationId, reason, preview: preview === true, noShow: noShow === true, waive: waive === true });
  } catch (error) {
    if (error instanceof CancelError) throw new BillingError(error.httpStatus, error.message);
    throw error;
  }
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
    if (!holdsRoom(r) || (r.roomId && r.roomId !== roomId) || typeof r.checkIn !== 'string') return false;
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

// Walk-in day or night tour with just a cottage (no room).
// The resort is closed on planned closed dates (Settings → Closed dates).
async function assertResortOpen(checkIn, checkOut) {
  const settings = await adminDb.doc('siteSettings/resortAvailability').get();
  const closedPeriod = settings.exists ? findClosedPeriod(settings.data().closedDates, checkIn, checkOut || checkIn) : null;
  if (closedPeriod) throw new BillingError(409, closedPeriodMessage(closedPeriod));
}

async function createCottageWalkIn({ staff, booking }) {
  const firstName = cleanText(booking.firstName, 35);
  const lastName = cleanText(booking.lastName, 35);
  const tourPeriod = booking.bookingOption === 'night' ? 'night' : booking.bookingOption === 'day' ? 'day' : '';
  if (!tourPeriod) throw new BillingError(400, 'A cottage-only booking is for a day tour or a night tour.');
  const date = typeof booking.checkIn === 'string' ? booking.checkIn : '';
  const today = manilaDateKey();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < today) throw new BillingError(400, 'Choose today or a later date.');
  const cutoff = getWalkInTourCutoffError(date, tourPeriod);
  if (cutoff) throw new BillingError(400, cutoff);
  await assertResortOpen(date, date);
  let pricing;
  try {
    pricing = calculateCottageTourPrice({ adults: Number(booking.adults), children: Number(booking.children || 0), tourPeriod, cottageId: booking.cottageId });
  } catch (error) {
    throw new BillingError(400, error.message);
  }
  const fullError = cottageAvailabilityError(await getCottageAvailabilityFor(date, tourPeriod), booking.cottageId);
  if (fullError) throw new BillingError(409, fullError);
  const slot = tourPeriod === 'night' ? NIGHTTOUR_TIME_SLOT : DAYTOUR_TIME_SLOT;
  const reservationRef = adminDb.collection('reservations').doc();
  const guestName = joinGuestName(firstName, lastName);
  const totalAmount = money(pricing.subtotalAmount);
  await reservationRef.create({
    cottageOnly: true,
    roomId: '',
    roomNumber: `${pricing.cottageLabel} (cottage)`,
    roomType: `Cottage · ${tourPeriod} tour`,
    firstName,
    lastName,
    guestName,
    email: cleanText(booking.email, 120),
    phone: cleanText(booking.phone, 20),
    address: cleanText(booking.address, 300),
    preferredContactMethod: booking.preferredContactMethod,
    notes: cleanText(booking.notes, 1000),
    category: 'Cottage',
    bookingType: 'daytour',
    tourPeriod,
    checkIn: date,
    checkOut: date,
    checkInTime: slot.checkIn,
    checkOutTime: slot.checkOut,
    adults: Number(booking.adults),
    children: Number(booking.children || 0),
    totalGuests: pricing.totalGuests,
    nights: 1,
    cottageId: booking.cottageId,
    cottageFee: pricing.cottageFee,
    entranceAdultRate: pricing.entranceAdultRate,
    entranceChildRate: pricing.entranceChildRate,
    entranceFee: pricing.entranceFee,
    subtotalAmount: totalAmount,
    totalAmount,
    amountPaid: 0,
    paymentMethod: 'cash',
    paymentStatus: 'pending',
    type: 'walk-in',
    status: 'confirmed',
    // Part of the group is coming later (counted once checked in).
    ...(() => {
      const [here] = date === today ? splitArrivedGuests(booking.guestsHereNow, [Number(booking.adults) + Number(booking.children || 0)]) : [null];
      return here === null ? {} : { arrivedGuests: here };
    })(),
    createdBy: staff.uid,
    createdAt: FieldValue.serverTimestamp(),
  });
  return { totalAmount, amountPaid: 0, roomNumber: `${pricing.cottageLabel} (cottage)`, arrivesToday: date === today, checkedIn: false, reservationId: reservationRef.id, receipt: null, receiptError: '' };
}

async function createWalkIn({ staff, booking = {} }) {
  const firstName = cleanText(booking.firstName, 35);
  const lastName = cleanText(booking.lastName, 35);
  if (!NAME_PATTERN.test(firstName) || !NAME_PATTERN.test(lastName)) {
    throw new BillingError(400, 'Enter a valid first and last name (2-35 letters each).');
  }
  if (booking.cottageOnly === true) {
    if (!isPreferredContactMethod(booking.preferredContactMethod)) throw new BillingError(400, 'Choose a preferred contact method.');
    return createCottageWalkIn({ staff, booking });
  }
  const { roomId } = booking;
  if (typeof roomId !== 'string' || !roomId) throw new BillingError(400, 'Choose a room.');
  // More rooms for the same group: linked bookings, paid together.
  const roomsError = getAdditionalRoomsError(roomId, booking.additionalRooms);
  if (roomsError) throw new BillingError(400, roomsError);
  const additionalRooms = Array.isArray(booking.additionalRooms) ? booking.additionalRooms : [];
  if (!isPreferredContactMethod(booking.preferredContactMethod)) throw new BillingError(400, 'Choose a preferred contact method.');
  const paymentMethod = COUNTER_PAYMENT_METHODS.includes(booking.paymentMethod) ? booking.paymentMethod : '';
  const paymentStatus = WALK_IN_PAYMENT_STATUSES.includes(booking.paymentStatus) ? booking.paymentStatus : '';
  if (!paymentMethod || !paymentStatus) throw new BillingError(400, 'Choose a payment method and payment status.');
  // Optional cottage: only its id comes from the form; the price is looked up here.
  const cottageId = typeof booking.cottageId === 'string' ? booking.cottageId : '';
  const cottageFee = getCottageFee(cottageId);
  if (cottageFee === null) throw new BillingError(400, 'Choose a valid cottage.');
  // A cottage is optional, including for day and night tours with a room.
  if (cottageId) {
    const tour = ['day', 'night'].includes(booking.bookingOption) ? booking.bookingOption : 'both';
    const fullError = cottageAvailabilityError(await getCottageAvailabilityFor(String(booking.checkIn || ''), tour), cottageId);
    if (fullError) throw new BillingError(409, fullError);
  }
  const today = manilaDateKey();
  await assertResortOpen(String(booking.checkIn || '').slice(0, 10), String(booking.checkOut || booking.checkIn || '').slice(0, 10));

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
    const details = detailsFromForm(booking, { room, walkIn: true });
    if (blockedRoomStatus(room.status, details.checkIn, today)) throw new BillingError(409, `Room ${room.roomNumber} isn’t available right now.`);
    if (await roomIsTaken(transaction, { roomId, roomNumber: room.roomNumber, checkIn: details.checkIn, checkOut: details.checkOut })) {
      throw new BillingError(409, `Room ${room.roomNumber} was just booked for those dates. Please choose another room.`);
    }
    // Extra rooms: all reads happen before any write.
    const extras = [];
    for (const item of additionalRooms) {
      const extraRoomRef = adminDb.collection('rooms').doc(item.roomId);
      const extraSnap = await transaction.get(extraRoomRef);
      if (!extraSnap.exists) throw new BillingError(404, 'One of the extra rooms could not be found.');
      const extraRoom = extraSnap.data();
      const extraDetails = detailsFromForm({ ...booking, adults: item.adults, children: item.children }, { room: extraRoom, walkIn: true });
      if (blockedRoomStatus(extraRoom.status, extraDetails.checkIn, today)) throw new BillingError(409, `Room ${extraRoom.roomNumber} isn’t available right now.`);
      if (await roomIsTaken(transaction, { roomId: item.roomId, roomNumber: extraRoom.roomNumber, checkIn: extraDetails.checkIn, checkOut: extraDetails.checkOut })) {
        throw new BillingError(409, `Room ${extraRoom.roomNumber} was just booked for those dates. Please choose another room.`);
      }
      extras.push({ id: item.roomId, roomRef: extraRoomRef, room: extraRoom, details: extraDetails, ref: adminDb.collection('reservations').doc() });
    }
    const groupFields = extras.length
      ? { groupId: reservationRef.id, groupReservationIds: [reservationRef.id, ...extras.map(item => item.ref.id)], groupRoomCount: extras.length + 1 }
      : {};

    // Priced exactly like an online booking (room rate + extra guests).
    let pricing;
    try {
      pricing = priceBookingDetails(room, details, { cottageId, cottageFee, seasonPeriods: await readSeasonPeriods() });
    } catch (error) {
      throw new BillingError(409, error.message || `Room ${room.roomNumber} has no valid rate.`);
    }
    const totalAmount = money(pricing.subtotalAmount);
    const amountPaid = paymentStatus === 'paid' ? totalAmount : 0;
    const arrivesToday = details.checkIn === today;
    const checkedInNow = arrivesToday && amountPaid > 0 && amountPaid >= totalAmount;
    // Guests here now, shared across the rooms; the rest arrive later.
    const arrivedSplit = arrivesToday
      ? splitArrivedGuests(booking.guestsHereNow, [bookedGuestCount(details), ...extras.map(extra => bookedGuestCount(extra.details))])
      : [];
    const arrivedField = i => (arrivedSplit[i] === null || arrivedSplit[i] === undefined ? {} : { arrivedGuests: arrivedSplit[i] });

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
      lateArrival: isLateArrivalTime(details.checkInTime) && details.bookingType === 'overnight',
      lateArrivalSurcharge: pricing.lateArrivalSurcharge || 0,
      seasonalSurcharge: pricing.seasonalSurcharge || 0,
      seasonalLabel: pricing.seasonalLabel || '',
      cottageId,
      cottageFee,
      subtotalAmount: totalAmount,
      totalAmount,
      amountPaid,
      paymentMethod,
      paymentStatus,
      type: 'walk-in',
      ...groupFields,
      ...arrivedField(0),
      ...(arrivesToday ? { arrivalTime: formatResortClock() } : {}),
      // Paid in full and arriving today: the guest goes straight in.
      status: checkedInNow ? 'checked-in' : 'confirmed',
      ...(checkedInNow ? { checkedInAt: FieldValue.serverTimestamp() } : {}),
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
    // The room is occupied once the guest is checked in (paid, arriving today).
    if (checkedInNow) transaction.update(roomRef, { status: 'occupied' });
    const seasonPeriods = extras.length ? await readSeasonPeriods() : [];
    const linked = extras.map((extra, extraIndex) => {
      let extraPricing;
      try {
        extraPricing = priceBookingDetails(extra.room, extra.details, { cottageId: '', cottageFee: 0, seasonPeriods });
      } catch (error) {
        throw new BillingError(409, error.message || `Room ${extra.room.roomNumber} has no valid rate.`);
      }
      const extraTotal = money(extraPricing.subtotalAmount);
      transaction.set(extra.ref, {
        firstName, lastName, guestName,
        email: cleanText(booking.email, 120),
        phone: cleanText(booking.phone, 20),
        address: cleanText(booking.address, 300),
        preferredContactMethod: booking.preferredContactMethod,
        notes: `Booked together with Room ${room.roomNumber || ''} (booking #${reservationRef.id.slice(0, 8).toUpperCase()}).`,
        roomId: extra.id,
        roomNumber: extra.room.roomNumber || '',
        roomType: extra.room.type || '',
        ...extra.details,
        ...arrivedField(extraIndex + 1),
        baseRate: extraPricing.baseRate,
        baseCapacity: extraPricing.baseCapacity,
        extraGuestCharge: extraPricing.extraGuestCharge,
        lateArrival: isLateArrivalTime(extra.details.checkInTime) && extra.details.bookingType === 'overnight',
        lateArrivalSurcharge: extraPricing.lateArrivalSurcharge || 0,
        seasonalSurcharge: extraPricing.seasonalSurcharge || 0,
        seasonalLabel: extraPricing.seasonalLabel || '',
        cottageId: '',
        cottageFee: 0,
        subtotalAmount: extraTotal,
        totalAmount: extraTotal,
        amountPaid: 0,
        paymentMethod,
        paymentStatus: 'pending',
        type: 'walk-in',
        ...groupFields,
        status: 'confirmed',
        createdBy: staff.uid,
        createdAt: FieldValue.serverTimestamp(),
      });
      return { reservationId: extra.ref.id, roomNumber: extra.room.roomNumber || '', totalAmount: extraTotal };
    });
    return {
      totalAmount, amountPaid, roomNumber: room.roomNumber || '', arrivesToday, checkedIn: checkedInNow,
      rooms: [{ reservationId: reservationRef.id, roomNumber: room.roomNumber || '', totalAmount }, ...linked],
      groupTotal: money(totalAmount + linked.reduce((sum, item) => sum + item.totalAmount, 0)),
    };
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
async function editBooking({ staff, reservationId, changes = {}, preview = false, waivePolicy = false, waiveReason = '' }) {
  // Admins may move dates inside the 30-day window (e.g. typhoon closure).
  const waiving = waivePolicy === true;
  if (waiving && staff.role !== 'admin') throw new BillingError(403, 'Only an admin can waive the date-change rule.');
  if (waiving && !preview && cleanText(waiveReason, 300).length < 5) throw new BillingError(400, 'Write why the date-change rule is waived.');
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
    const oldRoomRef = adminDb.collection('rooms').doc(reservation.roomId);
    const oldRoomSnap = await transaction.get(oldRoomRef);
    if (!oldRoomSnap.exists) throw new BillingError(404, 'The booked room could not be found.');
    // Moving to another room: same size or bigger, never smaller.
    const newRoomId = typeof changes.roomId === 'string' && changes.roomId && changes.roomId !== reservation.roomId ? changes.roomId : '';
    let roomRef = oldRoomRef;
    let room = oldRoomSnap.data();
    if (newRoomId) {
      roomRef = adminDb.collection('rooms').doc(newRoomId);
      const newRoomSnap = await transaction.get(roomRef);
      if (!newRoomSnap.exists) throw new BillingError(404, 'The new room could not be found.');
      const changeError = getRoomChangeError(oldRoomSnap.data(), newRoomSnap.data());
      if (changeError) throw new BillingError(409, changeError);
      room = newRoomSnap.data();
      if (blockedRoomStatus(room.status, String(changes.checkIn ?? reservation.checkIn), manilaDateKey())) {
        throw new BillingError(409, `Room ${room.roomNumber} isn’t available right now.`);
      }
    }

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
    const dateBlock = waiving ? '' : getDateChangeBlock({ originalCheckIn: reservation.checkIn, newCheckIn: details.checkIn });
    if (dateBlock) throw new BillingError(409, dateBlock);
    if (await roomIsTaken(transaction, {
      roomId: newRoomId || reservation.roomId, roomNumber: room.roomNumber, checkIn: details.checkIn, checkOut: details.checkOut, ignoreId: reservationId,
    })) {
      throw new BillingError(409, `Room ${room.roomNumber} is already booked for those dates.`);
    }

    let pricing;
    try {
      pricing = priceBookingDetails(room, details, {
        seasonPeriods: await readSeasonPeriods(),
        cottageId: reservation.cottageId || '',
        cottageFee: Number(reservation.cottageFee || 0),
        keepCottageFee: true,
        dayVisitors: getReservationDayVisitors(reservation),
      });
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
      roomNumber: room.roomNumber || '',
      oldRoomNumber: reservation.roomNumber || '',
      roomChanged: Boolean(newRoomId),
    };
    if (preview) return { preview: true, ...quote };

    if (newRoomId && reservation.status === 'checked-in') {
      // Guest already inside: the old room needs cleaning, the new one is in use.
      transaction.update(oldRoomRef, { status: 'cleaning' });
      transaction.update(roomRef, { status: 'occupied' });
    }

    transaction.update(ref, {
      ...(waiving ? { policyWaived: true, policyWaivedReason: cleanText(waiveReason, 300), policyWaivedBy: staff.name || staff.email || '' } : {}),
      ...details,
      ...(newRoomId ? { roomId: newRoomId, roomNumber: room.roomNumber || '', roomType: room.type || '' } : {}),
      baseRate: pricing.baseRate,
      baseCapacity: pricing.baseCapacity,
      extraGuestCharge: pricing.extraGuestCharge,
      seasonalSurcharge: pricing.seasonalSurcharge || 0,
      seasonalLabel: pricing.seasonalLabel || '',
      subtotalAmount: pricing.subtotalAmount,
      totalAmount,
      paymentStatus: paymentStatusFor(totalAmount + extraCharges, amountPaid),
      editHistory: FieldValue.arrayUnion({
        id: crypto.randomUUID(),
        editedBy: staff.uid,
        editedByName: staff.name || staff.email || '',
        editedAt: new Date().toISOString(),
        ...(waiving ? { waiveReason: cleanText(waiveReason, 300) } : {}),
        from: {
          bookingType: reservation.bookingType || '', tourPeriod: reservation.tourPeriod || '',
          checkIn: reservation.checkIn || '', checkOut: reservation.checkOut || '',
          adults: Number(reservation.adults || 0), children: Number(reservation.children || 0),
          totalAmount: Number(reservation.totalAmount || 0), roomNumber: reservation.roomNumber || '',
        },
        to: { ...details, totalAmount, roomNumber: room.roomNumber || '' },
      }),
    });
    return { saved: true, ...quote };
  });
}

// Phone QR display: the laptop sends the current payment QR to the same
// staff account's phone (open at /admin/phone-display or
// /receptionist/phone-display), which shows it big for the guest.
async function setPhoneDisplay({ staff, url = '', amount = 0, guestName = '', sessionId = '' }) {
  const link = String(url || '');
  if (link && !/^https:\/\/[^\s]{8,1500}$/.test(link)) throw new BillingError(400, 'That payment link is not valid.');
  const display = link
    ? { url: link, amount: money(Number(amount) || 0), guestName: cleanText(guestName, 80), sessionId: cleanText(sessionId, 120), shownAt: Date.now() }
    : { url: '', amount: 0, guestName: '', sessionId: '', shownAt: Date.now() };
  await adminDb.collection('staffDisplays').doc(staff.uid).set(display);
  return { ok: true, showing: Boolean(link) };
}

async function getPhoneDisplay({ staff }) {
  const snap = await adminDb.collection('staffDisplays').doc(staff.uid).get();
  const data = snap.exists ? snap.data() : {};
  // A QR left showing for over 30 minutes is treated as finished.
  const fresh = data.url && Date.now() - Number(data.shownAt || 0) < 30 * 60 * 1000;
  return fresh ? { url: data.url, amount: data.amount, guestName: data.guestName, sessionId: data.sessionId, shownAt: data.shownAt } : { url: '' };
}

// Staff add another room to an existing booking (more guests coming).
// The new room is a linked booking on the same dates, with its own price
// and balance; Billing can take one payment for all the rooms.
async function addRoomToBooking({ staff, reservationId, roomId, adults, children = 0, preview = false }) {
  if (typeof roomId !== 'string' || !roomId) throw new BillingError(400, 'Choose the room to add.');
  return adminDb.runTransaction(async transaction => {
    const { ref, reservation } = await getReservation(transaction, reservationId);
    if (!['pending', 'confirmed', 'checked-in'].includes(reservation.status)) {
      throw new BillingError(409, 'Rooms can only be added to pending, confirmed or checked-in bookings.');
    }
    if (reservation.type === 'corporate' || reservation.type === ROOM_BLOCK_TYPE || !reservation.roomId) {
      throw new BillingError(409, 'Use “Assign rooms” for corporate and group bookings.');
    }
    const groupIds = Array.isArray(reservation.groupReservationIds) && reservation.groupReservationIds.length
      ? reservation.groupReservationIds : [reservationId];
    if (groupIds.length >= MAX_ROOMS_PER_BOOKING) throw new BillingError(409, `A booking can have up to ${MAX_ROOMS_PER_BOOKING} rooms.`);
    const groupSnaps = await Promise.all(groupIds.filter(id => id !== reservationId).map(id => transaction.get(adminDb.collection('reservations').doc(id))));
    if (reservation.roomId === roomId || groupSnaps.some(snap => snap.exists && snap.data().roomId === roomId)) {
      throw new BillingError(409, 'This room is already part of the booking.');
    }
    const roomRef = adminDb.collection('rooms').doc(roomId);
    const roomSnap = await transaction.get(roomRef);
    if (!roomSnap.exists) throw new BillingError(404, 'This room could not be found.');
    const room = roomSnap.data();
    const details = detailsFromForm({
      bookingOption: getBookingOptionId(reservation),
      checkInTime: reservation.checkInTime,
      checkIn: reservation.checkIn,
      checkOut: reservation.checkOut,
      adults, children,
    }, { room, keepStartDate: reservation.checkIn });
    if (blockedRoomStatus(room.status, details.checkIn, manilaDateKey())) throw new BillingError(409, `Room ${room.roomNumber} isn’t available right now.`);
    if (await roomIsTaken(transaction, { roomId, roomNumber: room.roomNumber, checkIn: details.checkIn, checkOut: details.checkOut })) {
      throw new BillingError(409, `Room ${room.roomNumber} is already booked for those dates.`);
    }
    let pricing;
    try {
      pricing = priceBookingDetails(room, details, { seasonPeriods: await readSeasonPeriods() });
    } catch (error) {
      throw new BillingError(409, error.message || `Room ${room.roomNumber} has no valid rate.`);
    }
    const totalAmount = money(pricing.subtotalAmount);
    if (preview) return { preview: true, totalAmount, roomNumber: room.roomNumber || '' };

    const newRef = adminDb.collection('reservations').doc();
    const groupId = reservation.groupId || reservationId;
    const allIds = [...groupIds, newRef.id];
    const groupFields = { groupId, groupReservationIds: allIds, groupRoomCount: allIds.length };
    const insideNow = reservation.status === 'checked-in';
    transaction.update(ref, groupFields);
    groupSnaps.forEach(snap => { if (snap.exists) transaction.update(snap.ref, groupFields); });
    if (insideNow) transaction.update(roomRef, { status: 'occupied' });
    const copied = {};
    ['firstName', 'lastName', 'guestName', 'email', 'phone', 'address', 'preferredContactMethod', 'contactLink', 'userId', 'source']
      .forEach(key => { if (reservation[key] !== undefined) copied[key] = reservation[key]; });
    transaction.set(newRef, {
      ...copied,
      notes: `Room added by staff to booking #${reservationId.slice(0, 8).toUpperCase()} (Room ${reservation.roomNumber || ''}).`,
      roomId,
      roomNumber: room.roomNumber || '',
      roomType: room.type || '',
      ...details,
      baseRate: pricing.baseRate,
      baseCapacity: pricing.baseCapacity,
      extraGuestCharge: pricing.extraGuestCharge,
      lateArrival: isLateArrivalTime(details.checkInTime) && details.bookingType === 'overnight',
      lateArrivalSurcharge: pricing.lateArrivalSurcharge || 0,
      seasonalSurcharge: pricing.seasonalSurcharge || 0,
      seasonalLabel: pricing.seasonalLabel || '',
      cottageId: '',
      cottageFee: 0,
      subtotalAmount: totalAmount,
      totalAmount,
      amountPaid: 0,
      paymentMethod: reservation.paymentMethod || 'cash',
      paymentStatus: 'pending',
      type: reservation.type || 'walk-in',
      ...groupFields,
      status: insideNow ? 'checked-in' : 'confirmed',
      ...(insideNow ? { checkedInAt: FieldValue.serverTimestamp() } : {}),
      createdBy: staff.uid,
      createdAt: FieldValue.serverTimestamp(),
    });
    return { added: true, reservationId: newRef.id, totalAmount, roomNumber: room.roomNumber || '', mainRoomNumber: reservation.roomNumber || '' };
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
    else if (body.action === 'record-group-payment') result = await recordGroupPayment({ ...body, staff });
    else if (body.action === 'assign-corporate-rooms') result = await assignCorporateRooms({ ...body, staff });
    else if (body.action === 'create-corporate-walk-in') result = await createCorporateWalkIn({ staff, booking: body.booking });
    else if (body.action === 'add-service') result = await addService({ ...body, staff });
    else if (body.action === 'apply-discount') result = await applyDiscount({ ...body, staff });
    else if (body.action === 'cancel-with-policy') result = await cancelWithPolicy({ ...body, staff });
    else if (body.action === 'create-walk-in') result = await createWalkIn({ staff, booking: body.booking });
    else if (body.action === 'edit-booking') result = await editBooking({ ...body, staff });
    else if (body.action === 'add-room-to-booking') result = await addRoomToBooking({ ...body, staff });
    else if (body.action === 'phone-display-set') result = await setPhoneDisplay({ ...body, staff });
    else if (body.action === 'phone-display-get') result = await getPhoneDisplay({ staff });
    else if (body.action === 'closure-notice') result = await sendClosureNotices({ ...body, staff });
    else if (body.action === 'update-guest') result = await updateGuest({ ...body, staff });
    else return res.status(400).json({ error: 'Choose a valid billing action.' });
    // Previews change nothing, so they aren't logged.
    const entry = result?.preview ? null : describeBillingAction(body, result || {});
    if (entry) {
      await logActivity(staff, {
        ...entry,
        reservationId: body.reservationId || result.reservationId || '',
        guestName: body.action === 'create-walk-in'
          ? `${body.booking?.firstName || ''} ${body.booking?.lastName || ''}`.trim()
          : '',
      });
    }
    return res.status(200).json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof BillingError) return res.status(error.httpStatus).json({ error: error.message });
    console.error('Staff billing action failed:', error);
    return res.status(500).json({ error: 'The change could not be saved. Please try again.' });
  }
}
