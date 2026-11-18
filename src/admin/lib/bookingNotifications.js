// Builds the staff notification list (bell in the top bar) from reservations.
//
// Bookings are watched through several small live queries (see
// NotificationBell): bookings made in the last NEW_BOOKING_DAYS days, and any
// booking with an open cancellation, refund or date-change request. Earlier
// versions only watched type == 'online' bookings that were still pending,
// so group/corporate bookings, and bookings confirmed straight away by an
// online payment, never showed up.

import { GUEST_REPLY_LABELS, isUnpaidOnlineBooking } from '../../lib/unpaidBookings';
import { agencyDueText, agencyPaymentDue, formatTermsLength, isAgencyBilled, paymentTermsOf } from '../../lib/agencyBilling';
import { formatManilaTime, getCheckoutDue, getOutstandingBalance, getOverstay } from '../../lib/reservationStatus';
import { arrivedGuestCount, bookedGuestCount, guestsStillToArrive } from '../../lib/guestArrivals';

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
    if (r.type === 'corporate-room') return; // group room blocks have no alerts of their own
    const guest = r.guestName || r.contactPerson || r.companyName || 'Guest';
    const status = lower(r.status);

    const createdMs = toMs(r.createdAt);
    // Extra rooms of a multi-room booking: the first room carries the alerts.
    const extraRoom = Boolean(r.groupId && r.groupId !== r.id);
    const roomCount = Number(r.groupRoomCount) > 1 ? Number(r.groupRoomCount) : 1;
    if (isGuestBooking(r) && !extraRoom && createdMs >= since && status !== 'cancelled') {
      const group = lower(r.type) === 'corporate';
      const unpaid = isUnpaidOnlineBooking(r);
      const paid = lower(r.paymentStatus) === 'paid' ? 'Paid' : lower(r.paymentStatus) === 'partial' ? 'Part paid' : 'Not paid yet';
      // Government "pay later": goes straight to Billing, with the promise.
      if (isAgencyBilled(r)) {
        items.push({
          id: `new-booking_${r.id}`,
          icon: 'ti-building-bank',
          badge: 'New Pay-Later Booking · Agency',
          message: `${r.companyName || guest} · ${ref(r.id)}`,
          details: `${r.checkIn || '—'}${r.checkOut && r.checkOut !== r.checkIn ? ` → ${r.checkOut}` : ''} · ${peso(r.totalAmount)} · pays within ${formatTermsLength(paymentTermsOf(r))} after check-out${r.agencyBilling?.poNumber ? ` · PO ${r.agencyBilling.poNumber}` : ' · waiting for PO'}`,
          timeMs: createdMs,
          bookingId: r.id,
          path: `${prefix}/billing`,
        });
      } else items.push({
        id: `new-booking_${r.id}`,
        icon: group ? 'ti-users-group' : unpaid ? 'ti-alert-triangle' : 'ti-calendar-plus',
        badge: group ? 'New Group Booking' : unpaid ? 'New Booking · Unpaid' : 'New Booking',
        message: `${guest} · ${ref(r.id)}`,
        details: `${r.checkIn || '—'}${r.checkOut && r.checkOut !== r.checkIn ? ` → ${r.checkOut}` : ''}${roomCount > 1 ? ` · ${roomCount} rooms` : ''} · ${peso(r.totalAmount)}${roomCount > 1 ? ' (first room)' : ''} · ${paid}${status ? ` · ${status}` : ''}`,
        timeMs: createdMs,
        bookingId: r.id,
        path,
      });
    }

    // Government "pay later": remind staff when the agency's payment is due
    // within 3 days, and when it is overdue.
    if (isAgencyBilled(r) && !extraRoom && status !== 'cancelled') {
      const owed = Math.max(0, getOutstandingBalance(r));
      const agencyDue = owed > 0 ? agencyPaymentDue(r, { balance: owed, now: new Date(now) }) : null;
      if (agencyDue && (agencyDue.overdue || agencyDue.daysLeft <= 3)) {
        items.push({
          id: `${agencyDue.overdue ? 'agency-overdue' : 'agency-due'}_${r.id}_${agencyDue.dueDate}`,
          icon: agencyDue.overdue ? 'ti-alert-triangle' : 'ti-calendar-dollar',
          badge: agencyDue.overdue ? 'Agency Payment Overdue' : 'Agency Payment Due Soon',
          message: `${r.companyName || guest} · ${peso(owed)}`,
          details: `${agencyDueText(agencyDue)} · booking ${ref(r.id)}${r.agencyBilling?.poNumber ? ` · PO ${r.agencyBilling.poNumber}` : ''}`,
          // Shown from the day it becomes due soon / overdue.
          timeMs: Date.parse(`${agencyDue.dueDate}T00:00:00+08:00`) - (agencyDue.overdue ? -86400000 : 3 * 86400000),
          bookingId: r.id,
          path: `${prefix}/billing`,
        });
      }
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

    // Checked in, but part of the group is still coming.
    const waiting = guestsStillToArrive(r);
    if (waiting > 0) {
      items.push({
        id: `guests-arriving_${r.id}_${arrivedGuestCount(r)}`,
        icon: 'ti-users',
        badge: 'Guests Still to Arrive',
        message: `${guest} · ${r.roomNumber ? `Room ${r.roomNumber}` : ref(r.id)}`,
        details: `${arrivedGuestCount(r)} of ${bookedGuestCount(r)} here · ${waiting} still to come. Open the booking and choose Guests arrived when they come.`,
        timeMs: toMs(r.checkedInAt) || createdMs,
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
        badge: request.closureMove ? 'Closure Reschedule' : 'Change Requested',
        message: `${guest} · ${ref(r.id)}${request.closureMove ? ' · same price, approve or reject' : ''}`,
        details: `${request.originalCheckIn || r.checkIn || '—'} → ${request.requestedCheckIn || r.checkIn || '—'} · ${lower(request.status).replaceAll('_', ' ')}`,
        timeMs: toMs(request.requestedAt) || toMs(r.updatedAt) || createdMs,
        bookingId: r.id,
        path,
      });
    }

    // Paid after the room hold ran out, and the room was taken meanwhile.
    if (r.holdConflict && !['cancelled', 'checked-out'].includes(status)) {
      items.push({
        id: `hold-conflict_${r.id}`,
        icon: 'ti-alert-octagon',
        badge: 'Paid After Hold Expired',
        message: `${guest} · ${ref(r.id)}`,
        details: `Paid ${peso(r.amountPaid)} but the room was rebooked. Move them to another room or refund.`,
        timeMs: toMs(r.holdConflictAt) || createdMs,
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

const PAYMENT_METHODS = { cash: 'cash', gcash: 'GCash', paymaya: 'Maya', maya: 'Maya', grab_pay: 'GrabPay', card: 'card', qrph: 'QR Ph', bank: 'bank transfer', online: 'online' };

// Payments from the last NEW_BOOKING_DAYS days (counter and PayMongo).
// Rooms paid together show once, on the lead share, with the full amount.
export function buildPaymentNotifications(payments, { prefix = '/admin', now = Date.now() } = {}) {
  const since = now - NEW_BOOKING_DAYS * 86400000;
  return payments
    .filter(p => toMs(p.createdAt) >= since && Number(p.amount) > 0)
    .filter(p => !(p.groupPaymentKey && p.groupLead === false))
    .map(p => {
      const online = p.provider === 'paymongo';
      const amount = p.groupPaymentKey ? (p.groupPaymentTotal ?? p.amount) : p.amount;
      const method = PAYMENT_METHODS[lower(p.method)] || p.method || '';
      return {
        id: `payment_${p.groupPaymentKey || p.id}`,
        icon: online ? 'ti-credit-card' : 'ti-cash',
        badge: online ? 'Online Payment Received' : 'Payment Recorded',
        message: `${p.guestName || 'Guest'} · ${peso(amount)}${method ? ` ${method}` : ''}`,
        details: `Booking ${ref(p.groupId || p.reservationId)}${p.groupPaymentKey ? ' · all rooms' : ''}${p.recordedByName ? ` · by ${p.recordedByName}` : ''}`,
        timeMs: toMs(p.createdAt),
        path: `${prefix}/reservations`,
        bookingId: p.reservationId || '',
      };
    });
}

// Guest chats with an unread message. `unreadSince` maps each chat to the
// time it first became unread, so the automatic reply (which also updates
// the chat's last-message time) doesn't count as a second notification.
export function buildChatNotifications(conversations, unreadSince = {}, { prefix = '/admin' } = {}) {
  return conversations
    .filter(c => c.unread === true)
    .map(c => {
      const at = unreadSince[c.id] || toMs(c.lastMessageAt);
      return {
        id: `chat_${c.id}_${at}`,
        icon: 'ti-message-circle-2',
        badge: 'New Guest Message',
        message: c.guestName || 'A guest',
        details: String(c.lastMessage || '').slice(0, 110) || 'Open Messages to reply.',
        timeMs: at,
        path: `${prefix}/messages`,
      };
    });
}
