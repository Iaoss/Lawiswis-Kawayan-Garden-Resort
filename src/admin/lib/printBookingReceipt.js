// Opens a printable receipt (statement of account) for a booking in a new
// window: what was booked, charges, payments, and any cancellation. Staff
// print it and hand it to the guest as their paper receipt.
import { getReceiptLineItems } from '../../lib/receiptItems';
import { formatStayDateTime } from '../../lib/stayTimes';
import QRCode from 'qrcode';
import { agencyPaymentDue, agencyPromiseText, formatDueDate, formatTermsLength, isAgencyBilled, paymentTermsOf, PAY_LATER_LABEL } from '../../lib/agencyBilling';

// QR as an inline SVG, made right here (no outside website), so it always
// prints. Built synchronously so the print window isn't blocked as a pop-up.
function qrSvg(text, size = 140) {
  try {
    const { modules } = QRCode.create(text, { errorCorrectionLevel: 'M' });
    const n = modules.size;
    const quiet = 2;
    let path = '';
    for (let y = 0; y < n; y += 1) for (let x = 0; x < n; x += 1) if (modules.get(x, y)) path += `M${x + quiet} ${y + quiet}h1v1h-1z`;
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${n + quiet * 2} ${n + quiet * 2}" shape-rendering="crispEdges" role="img" aria-label="Feedback QR code"><rect width="100%" height="100%" fill="#fff"/><path d="${path}" fill="#000"/></svg>`;
  } catch {
    return '';
  }
}

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
  // Feedback QR for guests who are leaving (or have left), same as the
  // thank-you email link. 
  const showFeedback = ['checked-in', 'checked-out'].includes(r.status);
  const feedbackUrl = `${window.location.origin}/feedback?bookingId=${encodeURIComponent(r.id)}`;
  const qr = showFeedback ? qrSvg(feedbackUrl) : '';
  // Government "pay later": who pays, the PO and the payment promise.
  const agencyBilled = isAgencyBilled(r) && !cancelled;
  const agency = r.agencyBilling || {};
  const agencyDue = agencyBilled ? agencyPaymentDue(r, { balance }) : null;

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
  .feedback { display: flex; gap: 14px; align-items: center; border: 1px dashed #9cb56f; padding: 10px 12px; margin-top: 18px; break-inside: avoid; }
  .feedback img, .feedback svg { width: 90px; height: 90px; } .feedback strong { color: #163c2b; font-size: 13px; }
  .head { display: flex; justify-content: space-between; gap: 16px; border-bottom: 2px solid #163c2b; padding-bottom: 8px; }
  .head .muted { font-size: 10.5px; }
  .promise { margin-top: 12px; padding: 10px 12px; border: 1px solid #a5b4fc; background: #eef2ff; break-inside: avoid; }
  .promise strong { color: #312e81; }
  .promise.overdue { border-color: #dc2626; background: #fef2f2; }
  .sign { display: flex; justify-content: space-between; gap: 30px; margin-top: 40px; }
  .sign div { flex: 1; border-top: 1px solid #111827; padding-top: 4px; text-align: center; font-size: 11px; color: #4b5563; }
  footer { margin-top: 18px; font-size: 10px; color: #6b7280; }
</style></head>
<body>
  <div class="head">
    <div><div class="brand">Lawiswis Kawayan Garden Resort</div><div class="muted">402 Brgy. Buguion, Calumpit, Bulacan · 0917 811 2332 · lawiswiskawayan123@gmail.com</div></div>
    <div style="text-align:right"><strong>No. ${esc(ref)}</strong><br><span class="muted">${esc(issued)}</span></div>
  </div>
  <h1>${cancelled ? 'Cancellation statement' : agencyBilled && balance > 0 ? 'Billing receipt (pay later)' : 'Official booking receipt'}</h1>
  <div class="muted">Booking #${esc(ref)} · Printed ${esc(issued)}</div>

  <h2>Guest and stay</h2>
  <table>
    ${r.companyName ? row(agencyBilled ? 'Agency' : 'Company', esc(r.companyName)) : ''}
    ${row(r.companyName ? 'Contact person' : 'Guest', esc(r.guestName || 'Guest'))}
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
    ${cancelled ? '' : row(agencyBilled ? 'Due from agency' : 'Balance due', peso(balance))}
  </table>

  ${agencyBilled ? `
  <h2>${esc(PAY_LATER_LABEL)} · charged to the agency</h2>
  <table>
    ${row('Agency', esc(r.companyName || agency.office || '—'))}
    ${agency.office && r.companyName ? row('Office / unit', esc(agency.office)) : ''}
    ${agency.tin ? row('TIN', esc(agency.tin)) : ''}
    ${row('Purchase Order no.', esc(agency.poNumber || 'To follow'))}
    ${row('Payment terms', esc(paymentTermsOf(r) > 0 ? `Within ${formatTermsLength(paymentTermsOf(r))} after check-out` : 'On check-out'))}
    ${agencyDue ? row('Payment due', esc(formatDueDate(agencyDue.dueDate)), true) : ''}
  </table>
  <div class="promise${agencyDue?.overdue ? ' overdue' : ''}"><strong>Payment promise:</strong> ${esc(agencyPromiseText(r, { balance }))}${balance > 0 ? ` Amount to pay: <strong>${peso(balance)}</strong>.` : ' Paid in full. Thank you.'}</div>` : ''}

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

  ${showFeedback ? `<div class="feedback">${qr}<div><strong>How was your stay?</strong><br>Scan with your phone camera to rate us. It takes 1 minute and helps us improve.<br><small>${esc(feedbackUrl)}</small></div></div>` : ''}
  <div class="sign"><div>Received by (resort staff)</div><div>${agencyBilled ? 'Agency representative' : 'Guest signature'}</div></div>
  <footer>Keep this receipt for your records. Questions: contact the resort with booking #${esc(ref)}.</footer>
  <script>window.onload = function () { setTimeout(function () { window.print(); }, 400); };</script>
</body></html>`;

  const win = window.open('', '_blank', 'width=720,height=900');
  if (!win) return false;
  win.document.open();
  win.document.write(html);
  win.document.close();
  return true;
}
