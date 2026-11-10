// Printable Statement of Account (SOA) for a government agency / per diem
// group billed to its agency: who to bill, the PO, the charges, payments
// received and the amount the agency still has to pay.
import { getReceiptLineItems } from '../../lib/receiptItems';
import { formatStayDateTime } from '../../lib/stayTimes';

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const peso = value => `₱${Number(value || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const row = (label, value, bold = false) => `<tr${bold ? ' class="total"' : ''}><td>${label}</td><td>${value}</td></tr>`;
const longDate = key => (key ? new Date(`${String(key).slice(0, 10)}T00:00:00`).toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' }) : '—');

export function printStatementOfAccount(reservation, payments = []) {
  const r = reservation;
  const ref = r.id.slice(0, 8).toUpperCase();
  const agency = r.agencyBilling || {};
  const items = getReceiptLineItems(r);
  const paid = Number(r.amountPaid || 0);
  const due = Math.max(0, items.grandTotal - paid);
  const issued = new Date().toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'Asia/Manila' });
  const event = r.type === 'corporate'
    ? `${r.packageName || 'Group package'} · ${Number(r.totalGuests || 0)} guests${r.packageRate ? ` × ${peso(r.packageRate)}` : ''}`
    : r.roomName || `Room ${r.roomNumber || ''}`;
  const dates = r.checkOut && r.checkOut !== r.checkIn ? `${longDate(r.checkIn)} to ${longDate(r.checkOut)}` : longDate(r.checkIn);

  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Statement of Account SOA-${esc(ref)}</title>
<style>
  @page { size: A4; margin: 16mm; }
  body { font: 12px/1.55 Arial, sans-serif; color: #111827; margin: 0; padding: 24px; }
  .head { display: flex; justify-content: space-between; gap: 20px; border-bottom: 2px solid #163c2b; padding-bottom: 10px; }
  .brand { font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: #163c2b; font-size: 14px; }
  h1 { font-size: 22px; margin: 16px 0 2px; color: #163c2b; }
  h2 { font-size: 12px; margin: 18px 0 4px; color: #163c2b; text-transform: uppercase; letter-spacing: .06em; }
  .muted { color: #6b7280; }
  .cols { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
  table { width: 100%; border-collapse: collapse; }
  td { padding: 5px 0; border-bottom: 1px solid #eef0ee; vertical-align: top; }
  td:last-child { text-align: right; padding-left: 12px; }
  .total td { font-weight: 700; border-top: 2px solid #163c2b; }
  .due { margin-top: 14px; padding: 12px 14px; background: #f3f8ec; border: 1px solid #9cb56f; display: flex; justify-content: space-between; font-size: 16px; font-weight: 700; color: #163c2b; }
  .sign { display: flex; justify-content: space-between; gap: 40px; margin-top: 56px; }
  .sign div { flex: 1; border-top: 1px solid #111827; padding-top: 4px; text-align: center; font-size: 11px; color: #4b5563; }
  footer { margin-top: 22px; font-size: 10.5px; color: #4b5563; }
</style></head>
<body>
  <div class="head">
    <div><div class="brand">Lawiswis Kawayan Garden Resort</div><div class="muted">402 Brgy. Buguion, Calumpit, Bulacan · 0917 811 2332 · lawiswiskawayan123@gmail.com</div></div>
    <div style="text-align:right"><strong>SOA-${esc(ref)}</strong><br><span class="muted">Date: ${esc(issued)}</span></div>
  </div>
  <h1>Statement of Account</h1>

  <div class="cols">
    <div>
      <h2>Bill to</h2>
      <table>
        ${row('Agency', esc(r.companyName || '—'))}
        ${agency.office ? row('Office / unit', esc(agency.office)) : ''}
        ${agency.tin ? row('TIN', esc(agency.tin)) : ''}
        ${row('Contact person', esc(r.guestName || '—'))}
        ${r.email ? row('Email', esc(r.email)) : ''}
        ${r.phone ? row('Mobile', esc(r.phone)) : ''}
      </table>
    </div>
    <div>
      <h2>Reference</h2>
      <table>
        ${row('Purchase Order no.', esc(agency.poNumber || 'To follow'))}
        ${row('Booking no.', `#${esc(ref)}`)}
        ${row('Event / stay', esc(event))}
        ${row('Date(s)', esc(dates))}
        ${agency.perDiemRate ? row('Per diem (per person/day)', peso(agency.perDiemRate)) : ''}
      </table>
    </div>
  </div>

  <h2>Charges</h2>
  <table>
    ${items.booking.map(i => row(esc(i.label), peso(i.amount))).join('')}
    ${items.extras.map(i => row(esc(i.label), peso(i.amount))).join('')}
    ${row('Total (VAT included)', peso(items.grandTotal), true)}
    ${row('Net of VAT', peso(items.vat.net))}
    ${row('12% VAT', peso(items.vat.vat))}
  </table>

  <h2>Payments received</h2>
  <table>
    ${payments.length
    ? payments.map(p => row(`${esc(formatStayDateTime(p.createdAt) || '—')} · ${esc(p.method || 'payment')}${p.officialReceiptNo ? ` · OR no. ${esc(p.officialReceiptNo)}` : ''}`, peso(p.amount))).join('')
    : row('No payments yet', peso(0))}
    ${row('Total received', peso(paid), true)}
  </table>

  <div class="due"><span>Amount due</span><span>${peso(due)}</span></div>

  <footer>
    Please settle this statement with <strong>Lawiswis Kawayan Garden Resort</strong> (cash, GCash or QR Ph), quoting SOA-${esc(ref)} and the PO number.
    An official receipt is issued once payment is received. For questions, contact the resort.
  </footer>
  <div class="sign"><div>Prepared by (resort)</div><div>Received by (agency)</div></div>
  <script>window.onload = function () { setTimeout(function () { window.print(); }, 400); };</script>
</body></html>`;

  const win = window.open('', '_blank', 'width=820,height=1000');
  if (!win) return false;
  win.document.open();
  win.document.write(html);
  win.document.close();
  return true;
}
