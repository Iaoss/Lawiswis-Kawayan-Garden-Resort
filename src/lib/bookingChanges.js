// Everything that changed on a booking after it was made, newest first, for
// the Reservation History details: staff edits (dates, type, guests, price),
// the guest's date-change request and its decision, guest-detail updates,
// policy waivers and closure notices.

const toMs = value => {
  if (!value) return 0;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (typeof value.seconds === 'number') return value.seconds * 1000;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : 0;
};
const peso = value => `₱${Number(value || 0).toLocaleString('en-PH')}`;
const typeLabel = (bookingType, tourPeriod) => (bookingType === 'daytour' ? (tourPeriod === 'night' ? 'Night tour' : 'Day tour') : 'Overnight');
const range = (from, to) => (from && to && from !== to ? `${from} → ${to}` : from || '—');

// Describes what differs between two snapshots of the booking.
function diff(from = {}, to = {}) {
  const parts = [];
  if (from.checkIn !== to.checkIn || from.checkOut !== to.checkOut) parts.push(`Dates ${range(from.checkIn, from.checkOut)} → ${range(to.checkIn, to.checkOut)}`);
  if (from.bookingType !== to.bookingType || (to.bookingType === 'daytour' && from.tourPeriod !== to.tourPeriod)) {
    parts.push(`Type ${typeLabel(from.bookingType, from.tourPeriod)} → ${typeLabel(to.bookingType, to.tourPeriod)}`);
  }
  if (Number(from.adults) !== Number(to.adults) || Number(from.children) !== Number(to.children)) {
    parts.push(`Guests ${Number(from.adults) || 0}+${Number(from.children) || 0} → ${Number(to.adults) || 0}+${Number(to.children) || 0}`);
  }
  if (Number(from.totalAmount) !== Number(to.totalAmount)) parts.push(`Total ${peso(from.totalAmount)} → ${peso(to.totalAmount)}`);
  return parts.join(' · ') || 'No price or date change';
}

export function getBookingChanges(reservation = {}) {
  const r = reservation;
  const items = [];
  (Array.isArray(r.editHistory) ? r.editHistory : []).forEach(entry => {
    items.push({
      key: `edit_${entry.id || entry.editedAt}`,
      at: toMs(entry.editedAt),
      title: 'Edited by staff',
      by: entry.editedByName || '',
      text: `${diff(entry.from, entry.to)}${entry.waiveReason ? ` · date-change rule waived: ${entry.waiveReason}` : ''}`,
    });
  });
  const request = r.modificationRequest;
  if (request && typeof request === 'object') {
    const status = String(request.status || '').replaceAll('_', ' ');
    items.push({
      key: `request_${request.id || 'x'}`,
      at: toMs(request.decidedAt) || toMs(request.requestedAt),
      title: `Guest asked to change dates · ${status || 'requested'}`,
      by: '',
      text: `${range(request.originalCheckIn, request.originalCheckOut)} → ${range(request.requestedCheckIn, request.requestedCheckOut)}${request.staffReason ? ` · Staff note: ${request.staffReason}` : ''}`,
    });
  }
  if (r.guestInfoUpdatedAt) {
    items.push({ key: 'guest-info', at: toMs(r.guestInfoUpdatedAt), title: 'Guest details updated', by: r.guestInfoUpdatedBy || '', text: 'Name or contact details corrected in Customer Management.' });
  }
  if (r.closureNotice?.sentAt) {
    items.push({ key: 'closure', at: toMs(r.closureNotice.sentAt), title: 'Resort-closure notice emailed', by: r.closureNotice.sentBy || '', text: `${range(r.closureNotice.closedFrom, r.closureNotice.closedTo)}${r.closureNotice.reason ? ` · ${r.closureNotice.reason}` : ''}` });
  }
  if (r.policyWaived && r.status === 'cancelled') {
    items.push({ key: 'waived', at: toMs(r.cancelledAt), title: 'Cancelled with the policy waived', by: r.policyWaivedBy || '', text: r.policyWaivedReason || '' });
  }
  return items.sort((a, b) => b.at - a.at);
}
