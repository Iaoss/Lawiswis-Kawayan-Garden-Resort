// Opens a printable receipt (statement of account) for a booking in a new
// window: what was booked, charges, payments, and any cancellation. Staff
// print it and hand it to the guest as their paper receipt.
import { getReceiptLineItems } from '../../lib/receiptItems';
import { formatStayDateTime } from '../../lib/stayTimes';

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const peso = value => `${Number(value) < 0 ? '−' : ''}₱${Math.abs(Number(value || 0)).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const row = (label, value, bold = false) => `<tr${bold ? ' class="total"' : ''}><td>${label}</td><td>${value}</td></tr>`;

export const paymentReceiptNumber = payment => `RCP-${String(payment.id || '').slice(-8).toUpperCase()}`;

export function printBookingReceipt(reservation, payments = []) {
  const r = reservation;
  const ref = r.id.slice(0, 8).toUpperCase();
  const items = getReceiptLineItems(r);
  const paid = Number(r.amountPaid || 0);
  const cancelled = r.status === 'cancelled';
  const balance = cancelled ? 0 : Math.max(0, items.grandTotal - paid);
  const stay = r.type === 'corporate'
    ? `${r.packageName || 'Group package'} · ${Number(r.totalGuests || 0)} guests`
    : r.cottageOnly ? `Cottage · ${r.tourPeriod === 'night' ? 'Night tour' : 'Day tour'}`
      : r.roomName || `Room ${r.roomNumber || ''}${r.roomType ? ` (${r.roomType})` : ''}`;
  const issued = new Date().toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Manila' });

  const paymentRows = payments.length
    ? payments.map(p => row(
      `${esc(formatStayDateTime(p.createdAt) || '—')} · ${esc(p.method || 'payment')} · ${esc(paymentReceiptNumber(p))}${p.officialReceiptNo ? ` · paper no. ${esc(p.officialReceiptNo)}` : ''}`,
      peso(p.amount),
    )).join('')
    : row('Payments recorded', peso(paid));

  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Receipt #${esc(ref)}</title>
<style>
  @page { size: A5; margin: 12mm; }
  body { font: 12px/1.5 Arial, sans-serif; color: #111827; margin: 0; padding: 20px; }
  .brand { font-weight: 700; letter-spacing: .1em; text-transform: uppercase; color: #1a3a1a; font-size: 12px; }
  h1 { font-size: 20px; margin: 10px 0 2px; color: ${cancelled ? '#991b1b' : '#163c2b'}; }
  h2 { font-size: 12px; margin: 16px 0 4px; color: #163c2b; text-transform: uppercase; letter-spacing: .06em; }
  .muted { color: #6b7280; }
  table { width: 100%; border-collapse: collapse; }
  td { padding: 5px 0; border-bottom: 1px solid #eef0ee; vertical-align: top; }
  td:last-child { text-align: right; white-space: nowrap; padding-left: 12px; }
  .total td { font-weight: 700; border-top: 2px solid #163c2b; }
  .sign { display: flex; justify-content: space-between; gap: 30px; margin-top: 40px; }
  .sign div { flex: 1; border-top: 1px solid #111827; padding-top: 4px; text-align: center; font-size: 11px; color: #4b5563; }
  footer { margin-top: 18px; font-size: 10px; color: #6b7280; }
</style></head>
<body>
  <div class="brand">Lawiswis Kawayan Garden Resort</div>
  <h1>${cancelled ? 'Cancellation statement' : 'Official booking receipt'}</h1>
  <div class="muted">Booking #${esc(ref)} · Printed ${esc(issued)}</div>

  <h2>Guest and stay</h2>
  <table>
    ${row('Guest', esc(r.guestName || 'Guest'))}
    ${r.phone ? row('Phone', esc(r.phone)) : ''}
    ${row('Booked', esc(stay))}
    ${row('Check-in', esc([r.checkIn, r.checkInTime].filter(Boolean).join(' · ') || '—'))}
    ${row('Check-out', esc([r.checkOut, r.checkOutTime].filter(Boolean).join(' · ') || '—'))}
    ${r.checkedInAt ? row('Checked in at', esc(formatStayDateTime(r.checkedInAt))) : ''}
    ${r.checkedOutAt ? row('Checked out at', esc(formatStayDateTime(r.checkedOutAt))) : ''}
  </table>

  <h2>Charges</h2>
  <table>
    ${items.booking.map(i => row(esc(i.label), peso(i.amount))).join('')}
    ${items.extras.map(i => row(esc(i.label), peso(i.amount))).join('')}
    ${row('Total (VAT included)', peso(items.grandTotal), true)}
    ${row('Net of VAT', peso(items.vat.net))}
    ${row('12% VAT', peso(items.vat.vat))}
  </table>

  <h2>Payments</h2>
  <table>
    ${paymentRows}
    ${row('Total paid', peso(paid), true)}
    ${cancelled ? '' : row('Balance due', peso(balance))}
  </table>

  ${cancelled ? `
  <h2>Cancellation</h2>
  <table>
    ${row('Cancelled on', esc(formatStayDateTime(r.cancelledAt) || '—'))}
    ${r.cancellationTier ? row('Policy', esc(r.cancellationTier)) : ''}
    ${row(`Cancellation fee${r.cancellationFeeRate !== undefined ? ` (${esc(r.cancellationFeeRate)}%)` : ''}`, peso(r.cancellationFee))}
    ${row('Refund to the guest', peso(r.refundAmount), true)}
    ${r.cancellationReason ? row('Reason', esc(r.cancellationReason)) : ''}
    ${r.cancellationReceiptNumber ? row('Cancellation receipt', esc(r.cancellationReceiptNumber)) : ''}
  </table>` : ''}

  <div class="sign"><div>Received by (resort staff)</div><div>Guest signature</div></div>
  <footer>Keep this receipt for your records. Questions: contact the resort with booking #${esc(ref)}.</footer>
  <script>window.onload = function () { window.print(); };</script>
</body></html>`;

  const win = window.open('', '_blank', 'width=720,height=900');
  if (!win) return false;
  win.document.open();
  win.document.write(html);
  win.document.close();
  return true;
}
