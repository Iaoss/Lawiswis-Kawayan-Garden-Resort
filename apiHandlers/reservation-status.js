// PATCH /api/reservation-status   (POST is accepted too)
//
// Staff-only endpoint for changing a reservation's status and handling
// overstays. Runs on the server so the rules below can't be skipped from the
// browser:
//
//   { action: 'set-status', reservationId, status, reason? }
//     Any status can move to any other status, except:
//       - receptionists can't change cancelled bookings, or cancel directly
//         (they send a cancellation request instead);
//       - a guest can't be checked out while a balance is still owed.
//   { action: 'flag-overstay', reservationId, note? }
//     Marks a checked-in guest who is past check-out as overstayed.
//   { action: 'add-late-fee', reservationId, amount, note? }
//     Adds a late check-out charge to an overstaying guest's bill.
//
// Overstay records (flag, late-fee total, minutes late at check-out) are kept
// on the reservation so the dashboard can report on them later.

import crypto from 'crypto';
import { adminDb, FieldValue } from '../lib/firebaseAdmin';
import { verifyStaff } from '../lib/verifyStaff';
import {
  MAX_LATE_FEE,
  RESERVATION_STATUSES,
  formatDuration,
  getOutstandingBalance,
  getOverstay,
  hasOutstandingBalance,
} from '../src/lib/reservationStatus';

// Room status to set after a reservation changes (unchanged from the old
// browser-side behaviour).
const ROOM_STATUS_AFTER = {
  'checked-in': 'occupied',
  'checked-out': 'cleaning',
  cancelled: 'vacant',
  confirmed: 'vacant',
  pending: 'vacant',
};

class StatusError extends Error {
  constructor(status, message) {
    super(message);
    this.httpStatus = status;
  }
}

const cleanText = (value, max) => (typeof value === 'string' ? value.trim().slice(0, max) : '');

function paymentStatusFor(total, paid) {
  if (Math.round(paid * 100) >= Math.round(total * 100)) return 'paid';
  return paid > 0 ? 'partial' : 'pending';
}

async function setStatus({ transaction, reservationRef, reservation, staff, status, reason }) {
  if (!RESERVATION_STATUSES.includes(status)) throw new StatusError(400, 'Choose a valid reservation status.');
  const current = String(reservation.status || 'pending');
  if (staff.role === 'receptionist' && current === 'cancelled') {
    throw new StatusError(403, 'Cancelled bookings can only be changed by an admin.');
  }
  if (staff.role === 'receptionist' && status === 'cancelled') {
    throw new StatusError(403, 'Receptionists can request a cancellation, but only an admin can cancel.');
  }
  if (status === current) return { status, unchanged: true };

  const now = new Date();
  const overstay = getOverstay(reservation, now);
  if (status === 'checked-out' && hasOutstandingBalance(reservation)) {
    throw new StatusError(409, overstay
      ? `Cannot check out: the guest overstayed by ${overstay.label} and still owes ₱${getOutstandingBalance(reservation).toLocaleString()}. Add any late check-out charge and collect payment first.`
      : 'The outstanding balance must be paid before checking out this guest.');
  }

  const roomRef = reservation.roomId ? adminDb.collection('rooms').doc(reservation.roomId) : null;
  const roomSnap = roomRef ? await transaction.get(roomRef) : null;

  const updates = {
    status,
    statusUpdatedAt: FieldValue.serverTimestamp(),
    statusUpdatedBy: staff.uid,
  };
  if (status === 'cancelled') {
    updates.cancellationRequested = false;
    updates.cancellationReason = reason;
  }
  if (status === 'checked-in' && !reservation.checkedInAt) updates.checkedInAt = FieldValue.serverTimestamp();
  if (status === 'checked-out') {
    updates.checkedOutAt = FieldValue.serverTimestamp();
    if (overstay) updates.overstayMinutes = overstay.minutes;
  }
  transaction.update(reservationRef, updates);
  // Closing out a no-show (never checked in) leaves a vacant room as it is.
  const noShowClose = status === 'checked-out' && current !== 'checked-in' && roomSnap?.data()?.status !== 'occupied';
  if (roomSnap?.exists && ROOM_STATUS_AFTER[status] && !noShowClose) {
    transaction.update(roomRef, { status: ROOM_STATUS_AFTER[status] });
  }
  return { status, previousStatus: current, overstayMinutes: overstay?.minutes || 0 };
}

function flagOverstay({ transaction, reservationRef, reservation, staff, note }) {
  const overstay = getOverstay(reservation, new Date());
  if (!overstay) throw new StatusError(409, 'This guest is not past their check-out time.');
  if (reservation.overstay?.flaggedAt) return { flagged: true, unchanged: true };
  transaction.update(reservationRef, {
    overstay: {
      flaggedAt: FieldValue.serverTimestamp(),
      flaggedBy: staff.uid,
      minutesAtFlag: overstay.minutes,
      note,
    },
  });
  return { flagged: true, overstayLabel: formatDuration(overstay.ms) };
}

function addLateFee({ transaction, reservationRef, reservation, staff, amount, note }) {
  const fee = Math.round(Number(amount) * 100) / 100;
  if (!Number.isFinite(fee) || fee <= 0 || fee > MAX_LATE_FEE) {
    throw new StatusError(400, `Enter a late check-out charge between ₱1 and ₱${MAX_LATE_FEE.toLocaleString()}.`);
  }
  const overstay = getOverstay(reservation, new Date());
  if (reservation.status !== 'checked-in' || (!overstay && !reservation.overstay?.flaggedAt)) {
    throw new StatusError(409, 'Late check-out charges can only be added for a checked-in guest who is past check-out.');
  }
  const extraCharges = Number(reservation.extraCharges || 0) + fee;
  const total = Number(reservation.totalAmount || 0) + extraCharges;
  const updates = {
    extraCharges: FieldValue.increment(fee),
    lateCheckoutChargeTotal: FieldValue.increment(fee),
    lateCheckoutCharges: FieldValue.arrayUnion({
      id: crypto.randomUUID(),
      amount: fee,
      note,
      addedBy: staff.uid,
      addedAt: new Date().toISOString(),
      overstayMinutes: overstay?.minutes || 0,
    }),
    paymentStatus: paymentStatusFor(total, Number(reservation.amountPaid || 0)),
  };
  // Charging a late fee also flags the overstay, if staff hadn't yet.
  if (!reservation.overstay?.flaggedAt && overstay) {
    updates.overstay = { flaggedAt: FieldValue.serverTimestamp(), flaggedBy: staff.uid, minutesAtFlag: overstay.minutes, note };
  }
  transaction.update(reservationRef, updates);
  return { lateFeeAdded: fee, extraCharges, balance: total - Number(reservation.amountPaid || 0) };
}

export default async function handler(req, res) {
  if (!['PATCH', 'POST'].includes(req.method)) {
    res.setHeader('Allow', ['PATCH', 'POST']);
    return res.status(405).json({ error: 'Method not allowed.' });
  }
  const staff = await verifyStaff(req);
  if (!staff) return res.status(401).json({ error: 'Not authorized.' });
  if (!adminDb) return res.status(503).json({ error: 'Reservation service is unavailable.' });

  const { action = 'set-status', reservationId, status, reason, amount, note } = req.body || {};
  if (typeof reservationId !== 'string' || !reservationId) {
    return res.status(400).json({ error: 'A reservation is required.' });
  }
  const reservationRef = adminDb.collection('reservations').doc(reservationId);

  try {
    let checkOutDate = '';
    const result = await adminDb.runTransaction(async transaction => {
      const snapshot = await transaction.get(reservationRef);
      if (!snapshot.exists) throw new StatusError(404, 'This reservation could not be found.');
      const reservation = snapshot.data();
      checkOutDate = reservation.checkOut || '';
      const context = { transaction, reservationRef, reservation, staff };
      if (action === 'set-status') return setStatus({ ...context, status, reason: cleanText(reason, 500) });
      if (action === 'flag-overstay') return flagOverstay({ ...context, note: cleanText(note, 300) });
      if (action === 'add-late-fee') return addLateFee({ ...context, amount, note: cleanText(note, 300) });
      throw new StatusError(400, 'Choose a valid reservation action.');
    });

    // Close the overstay alert once the guest has checked out.
    if (result.status === 'checked-out' && !result.unchanged) {
      try {
        await adminDb.collection('notifications').doc(`overstay-${reservationId}-${checkOutDate}`).update({ resolved: true });
      } catch { /* no alert was raised for this stay */ }
    }
    return res.status(200).json({ ok: true, reservationId, ...result });
  } catch (error) {
    if (error instanceof StatusError) return res.status(error.httpStatus).json({ error: error.message });
    console.error('Reservation status update failed:', error);
    return res.status(500).json({ error: 'The reservation could not be updated. Please try again.' });
  }
}
