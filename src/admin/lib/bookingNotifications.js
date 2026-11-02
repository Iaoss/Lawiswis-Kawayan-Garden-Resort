// Builds the staff notification list (bell in the top bar) from reservations.
//
// Bookings are watched through several small live queries (see
// NotificationBell): bookings made in the last NEW_BOOKING_DAYS days, and any
// booking with an open cancellation, refund or date-change request. Earlier
// versions only watched type == 'online' bookings that were still pending,
// so group/corporate bookings, and bookings confirmed straight away by an
// online payment, never showed up.

import { GUEST_REPLY_LABELS, isUnpaidOnlineBooking } from '../../lib/unpaidBookings';
import { formatManilaTime, getCheckoutDue, getOutstandingBalance, getOverstay } from '../../lib/reservationStatus';

export const NEW_BOOKING_DAYS = 7;
export const ACTIVE_MODIFICATION_STATUSES = ['requested', 'needs_review', 'awaiting_payment', 'awaiting_refund'];
export const ACTIVE_REFUND_STATUSES = ['requested', 'eligible', 'needs_review', 'awaiting_refund'];
export const MAX_NOTIFICATIONS = 40;

const toMs = value => {
  if (!value) return 0;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (typeof value.seconds === 'number') return value.seconds * 1000;
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
};
const ref = id => `#${String(id || '').slice(0, 8).toUpperCase()}`;
const peso = value => `₱${Number(value || 0).toLocaleString()}`;
const lower = value => String(value || '').toLowerCase();

export function formatNotificationTime(ms, now = Date.now()) {
  if (!ms) return 'Just now';
  const minutes = Math.round((now - ms) / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} min ago`;
  const date = new Date(ms);
  const sameDay = new Date(now).toDateString() === date.toDateString();
  return sameDay
    ? date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : date.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

// Bookings staff entered themselves (walk-ins) aren't "new" to them.
const isGuestBooking = r => lower(r.type) !== 'walk-in';

export function buildBookingNotifications(reservations, { prefix = '/admin', now = Date.now() } = {}) {
  const path = `${prefix}/reservations`;
  const since = now - NEW_BOOKING_DAYS * 86400000;
  const items = [];

  reservations.forEach(r => {
    const guest = r.guestName || r.contactPerson || r.companyName || 'Guest';
    const status = lower(r.status);

    const createdMs = toMs(r.createdAt);
    if (isGuestBooking(r) && createdMs >= since && status !== 'cancelled') {
      const group = lower(r.type) === 'corporate';
      const unpaid = isUnpaidOnlineBooking(r);
      const paid = lower(r.paymentStatus) === 'paid' ? 'Paid' : lower(r.paymentStatus) === 'partial' ? 'Part paid' : 'Not paid yet';
      items.push({
        id: `new-booking_${r.id}`,
        icon: group ? 'ti-users-group' : unpaid ? 'ti-alert-triangle' : 'ti-calendar-plus',
        badge: group ? 'New Group Booking' : unpaid ? 'New Booking · Unpaid' : 'New Booking',
        message: `${guest} · ${ref(r.id)}`,
        details: `${r.checkIn || '—'}${r.checkOut && r.checkOut !== r.checkIn ? ` → ${r.checkOut}` : ''} · ${peso(r.totalAmount)} · ${paid}${status ? ` · ${status}` : ''}`,
        timeMs: createdMs,
        bookingId: r.id,
        path,
      });
    }

    // Checked-in guests whose check-out time is close, or already past.
    const due = getCheckoutDue(r, new Date(now));
    const overstay = !due && getOverstay(r, new Date(now));
    if (due || overstay) {
      const owes = Math.max(0, getOutstandingBalance(r));
      const room = r.roomNumber ? `Room ${r.roomNumber}` : 'Group';
      items.push({
        id: due ? `checkout-due_${r.id}_${due.dueMs}` : `checkout-late_${r.id}_${r.checkOut}_${r.lateCheckoutUntil || ''}`,
        icon: due ? 'ti-clock-hour-4' : 'ti-alarm',
        badge: due ? 'Check-out Soon' : 'Past Check-out',
        message: `${guest} · ${room}`,
        details: due
          ? `Due ${formatManilaTime(due.dueMs)} · in ${due.minutesLeft} min${owes > 0 ? ` · owes ${peso(owes)}` : ''}`
          : `Overstayed ${overstay.label}${owes > 0 ? ` · owes ${peso(owes)}` : ''} · check out or give more time`,
        // Keeps these near the top while they matter.
        timeMs: now,
        bookingId: r.id,
        path,
      });
    }

    // The guest answered "Did you make this reservation?".
    const reply = r.unpaidFollowUp?.guestReply;
    if (reply && GUEST_REPLY_LABELS[reply] && isUnpaidOnlineBooking(r)) {
      items.push({
        id: `guest-reply_${r.id}_${reply}_${toMs(r.unpaidFollowUp.guestRepliedAt)}`,
        icon: reply === 'yes' ? 'ti-user-check' : 'ti-user-x',
        badge: 'Guest Replied',
        message: `${guest} · ${ref(r.id)}`,
        details: reply === 'yes'
          ? `${GUEST_REPLY_LABELS.yes}. Send a payment link.`
          : `${GUEST_REPLY_LABELS.no}. You may cancel it.`,
        timeMs: toMs(r.unpaidFollowUp.guestRepliedAt) || createdMs,
        bookingId: r.id,
        path,
      });
    }

    const request = r.modificationRequest;
    if (request && ACTIVE_MODIFICATION_STATUSES.includes(lower(request.status))) {
      items.push({
        id: `date-change_${request.id || r.id}`,
        icon: 'ti-calendar-time',
        badge: 'Change Requested',
        message: `${guest} · ${ref(r.id)}`,
        details: `${request.originalCheckIn || r.checkIn || '—'} → ${request.requestedCheckIn || r.checkIn || '—'} · ${lower(request.status).replaceAll('_', ' ')}`,
        timeMs: toMs(request.requestedAt) || toMs(r.updatedAt) || createdMs,
        bookingId: r.id,
        path,
      });
    }

    const refundOpen = ACTIVE_REFUND_STATUSES.includes(lower(r.refundRequestStatus));
    if (refundOpen || r.cancellationRequested) {
      items.push({
        id: `${refundOpen ? 'refund-requested' : 'cancellation-requested'}_${r.id}`,
        icon: refundOpen ? 'ti-receipt-refund' : 'ti-calendar-x',
        badge: refundOpen ? 'Refund Requested' : 'Cancellation Requested',
        message: `${guest} · ${ref(r.id)}`,
        details: `${r.refundDecision?.reason || r.cancellationReason || 'Awaiting staff review'}${refundOpen ? ` · ${peso(r.refundDecision?.refundableAmount)}` : ''}`,
        timeMs: toMs(r.refundRequestedAt) || toMs(r.cancellationRequestedAt) || createdMs,
        bookingId: r.id,
        path,
      });
    }
  });

  return items
    .sort((a, b) => b.timeMs - a.timeMs)
    .slice(0, MAX_NOTIFICATIONS);
}
