// Notes staff should see about how a booking ended or was handled:
// checking a guest out with money still owed (and why), cancellations,
// no-shows, late check-out fees and refunds. Shown on the reservation list,
// the customer's stay history and in Reports.

import { isHoldExpired } from './unpaidBookings';

const peso = value => `₱${Number(value || 0).toLocaleString('en-PH', { maximumFractionDigits: 2 })}`;

export function getReservationRemarks(r = {}) {
  const remarks = [];
  if (Number(r.checkedOutWithBalance) > 0) {
    const by = r.checkedOutWithBalanceByName ? ` (by ${r.checkedOutWithBalanceByName})` : '';
    remarks.push({
      type: 'unpaid-checkout',
      label: 'Checked out with unpaid balance',
      text: `${peso(r.checkedOutWithBalance)} unpaid. Reason: ${r.checkedOutWithBalanceReason || 'No reason recorded'}${by}`,
      tone: 'red',
    });
  }
  if (r.closedAsNoShow || r.noShow) {
    const fee = Number(r.cancellationFee) > 0 ? ` No-show fee ${peso(r.cancellationFee)}.` : '';
    remarks.push({ type: 'no-show', label: 'No-show', text: `The guest did not arrive.${fee}`, tone: 'amber' });
  }
  if (r.holdConflict && !['cancelled', 'checked-out'].includes(r.status)) {
    remarks.push({ type: 'hold-conflict', label: 'Paid after hold expired', text: 'The room was rebooked meanwhile. Move the guest or refund.', tone: 'red' });
  } else if (r.status === 'pending' && isHoldExpired(r)) {
    remarks.push({ type: 'hold-expired', label: 'Hold expired', text: 'Not paid in time, so the room was released to other guests.', tone: 'amber' });
  }
  if (r.policyWaived) {
    remarks.push({ type: 'waived', label: 'Policy waived', text: r.policyWaivedReason || 'Waived by an admin', tone: 'green' });
  }
  if (r.status === 'cancelled') {
    const parts = [];
    if (r.cancellationReason) parts.push(`Reason: ${r.cancellationReason}`);
    if (Number(r.cancellationFee) > 0) parts.push(`fee ${peso(r.cancellationFee)}`);
    if (Number(r.refundAmount) > 0) parts.push(`refund ${peso(r.refundAmount)}`);
    remarks.push({ type: 'cancelled', label: 'Cancelled', text: parts.join(' · ') || 'No reason recorded', tone: 'red' });
  }
  if (Number(r.lateCheckoutChargeTotal) > 0) {
    remarks.push({ type: 'late-fee', label: 'Late check-out', text: `${peso(r.lateCheckoutChargeTotal)} late check-out fee charged`, tone: 'amber' });
  }
  if (r.refundRequestStatus === 'refunded') {
    remarks.push({ type: 'refund', label: 'Refunded', text: `${peso(r.refundApprovedAmount || r.refundAmount)} returned to the guest`, tone: 'green' });
  }
  return remarks;
}

export const remarksText = r => getReservationRemarks(r).map(item => `${item.label}: ${item.text}`).join(' | ');
