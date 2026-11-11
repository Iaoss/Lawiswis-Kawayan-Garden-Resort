// Records what staff did, for the admin's Activity Log page.
// Written only by the server (after an action succeeds), so entries can't be
// faked or edited from the browser. A failed log write never fails the
// action itself.
import { adminDb, FieldValue } from './firebaseAdmin';

const clean = (value, max) => (typeof value === 'string' ? value.trim().slice(0, max) : '');
const peso = value => `₱${Number(value || 0).toLocaleString('en-PH', { maximumFractionDigits: 2 })}`;

export async function logActivity(staff, { action, summary, reservationId = '', guestName = '', details = {} }) {
  if (!adminDb || !staff?.uid || !action) return;
  try {
    await adminDb.collection('activityLogs').add({
      action: clean(action, 60),
      summary: clean(summary, 300),
      reservationId: clean(reservationId, 64),
      guestName: clean(guestName, 120),
      details,
      staffUid: staff.uid,
      staffName: clean(staff.name, 80),
      staffEmail: clean(staff.email, 120),
      staffRole: clean(staff.role, 20),
      createdAt: FieldValue.serverTimestamp(),
    });
  } catch (error) {
    console.error('Activity log write failed:', error);
  }
}

// One-line descriptions for the staff-billing actions.
export function describeBillingAction(body, result) {
  const ref = id => (id ? ` on booking #${String(id).slice(0, 8).toUpperCase()}` : '');
  switch (body.action) {
    case 'set-agency-billing':
      return { action: 'booking_edited', summary: result.chargeToAgency
        ? `Set charge to agency for ${clean(result.guestName, 60)}${result.poNumber ? ` (PO ${clean(result.poNumber, 40)})` : ' (waiting for PO)'}${result.confirmed ? ', booking confirmed' : ''}${ref(body.reservationId)}`
        : `Turned off charge to agency${ref(body.reservationId)}` };
    case 'record-payment':
      return { action: 'payment_recorded', summary: `Recorded ${peso(body.amount)} ${body.method || ''} payment${ref(body.reservationId)}`.replace(/\s+/g, ' ') };
    case 'assign-corporate-rooms':
      return { action: 'booking_edited', summary: `Assigned ${(result.assignedRooms || []).length} room(s) to ${clean(result.companyName, 60)}: ${(result.assignedRooms || []).map(item => item.roomNumber).join(', ').slice(0, 200) || 'none'}${ref(body.reservationId)}` };
    case 'create-corporate-walk-in':
      return { action: 'walk_in_created', summary: `Created walk-in group booking for ${clean(body.booking?.companyName, 60)} (${Number(body.booking?.totalGuests) || 0} guests, ${peso(result.totalAmount)})${ref(result.reservationId)}` };
    case 'record-group-payment':
      return { action: 'payment_recorded', summary: `Recorded ${peso(body.amount)} ${body.method || ''} payment for ${(result.rooms || []).length || 1} linked room(s)${ref(body.reservationId)}`.replace(/\s+/g, ' ') };
    case 'add-charge':
      return { action: 'charge_added', summary: `Added ${peso(body.amount)} charge "${clean(body.description, 80)}"${ref(body.reservationId)}` };
    case 'apply-discount':
      return { action: 'discount_applied', summary: `Applied ${body.kind === 'pwd' ? 'PWD' : 'senior citizen'} discount of ${peso(result.discount)} (ID ${clean(body.idNumber, 40)}, ${clean(body.checkMethod === 'doh' ? 'DOH registry' : body.checkMethod === 'philsys' ? 'PhilSys' : body.checkMethod === 'office' ? 'called issuing office' : 'card only', 30)})${ref(body.reservationId)}` };
    case 'apply-promo':
      return { action: 'discount_applied', summary: `Applied promo code ${clean(result.code, 32)} (${clean(result.label, 30)}, ${peso(result.discount)})${ref(body.reservationId)}` };
    case 'add-service':
      return { action: 'service_added', summary: `Added ${clean(result.description, 80) || 'a service'} (${peso(result.amount)})${ref(body.reservationId)}` };
    case 'cancel-with-policy':
      if (body.noShow) return { action: 'reservation_no_show', summary: `Marked booking${ref(body.reservationId)} as a no-show: fee ${peso(result.fee)}, refund ${peso(result.refund)}` };
      return {
        action: 'reservation_cancelled',
        summary: `Cancelled booking${ref(body.reservationId)}: fee ${peso(result.fee)}, refund ${peso(result.refund)}${body.waive ? ` (policy waived: ${clean(body.reason, 80)})` : ''}`,
      };
    case 'update-guest':
      return { action: 'guest_info_updated', summary: `Updated guest details for ${clean(result.guestName, 80)} (${(result.changed || []).join(', ') || 'no changes'}) on ${Number(result.updated) || 0} booking(s)` };
    case 'closure-notice':
      return { action: 'closure_notice_sent', summary: `Sent resort-closure notices (${clean(body.closedFrom, 10)} to ${clean(body.closedTo, 10)}) to ${Number(result.sent) || 0} guest(s)${body.reason ? `: ${clean(body.reason, 80)}` : ''}` };
    case 'create-walk-in':
      return { action: 'walk_in_created', summary: `Created walk-in for Room ${result.roomNumber || '—'} (${peso(result.totalAmount)})${ref(result.reservationId)}` };
    case 'edit-booking':
      return { action: 'booking_edited', summary: `Edited booking${ref(body.reservationId)}${result.roomChanged ? ` (Room ${clean(result.oldRoomNumber, 20)} → Room ${clean(result.roomNumber, 20)})` : ''}: total ${peso(result.oldTotal)} → ${peso(result.totalAmount)}${body.waivePolicy ? ` (30-day rule waived: ${clean(body.waiveReason, 80)})` : ''}` };
    case 'add-room-to-booking':
      return result.added ? { action: 'booking_room_added', summary: `Added Room ${clean(result.roomNumber, 20)} (${peso(result.totalAmount)}) to booking${ref(body.reservationId)}` } : null;
    default:
      return null;
  }
}
