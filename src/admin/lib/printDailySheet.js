// "Today's sheet": a one-page printout for the front desk with today's
// arrivals, departures and in-house guests, who has paid and what's owed.
// Printed each morning as a backup in case the internet goes down.
import { manilaDateKey, getOutstandingBalance } from '../../lib/reservationStatus';

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const peso = value => `₱${Number(value || 0).toLocaleString('en-PH', { maximumFractionDigits: 2 })}`;
const place = r => (r.cottageOnly ? `Cottage${r.cottageId ? ` (${r.roomNumber || r.cottageId})` : ''}` : r.type === 'corporate' ? (r.packageName || 'Group') : (r.roomName || (r.roomNumber ? `Room ${r.roomNumber}` : '—')));
const guests = r => (r.type === 'corporate' ? Number(r.totalGuests || 0) : Number(r.adults || 0) + Number(r.children || 0));

// Which bookings go in each section today (exported for tests).
export function getDailySheet(reservations = [], now = new Date()) {
  const today = manilaDateKey(now);
  const key = value => String(value || '').slice(0, 10);
  const live = reservations.filter(r => !['cancelled'].includes(String(r.status || '').toLowerCase()));
  const byTime = (a, b) => String(a.checkInTime || '').localeCompare(String(b.checkInTime || '')) || String(a.guestName || '').localeCompare(String(b.guestName || ''));
  return {
    today,
    arrivals: live.filter(r => key(r.checkIn) === today && ['pending', 'confirmed', 'checked-in'].includes(r.status)).sort(byTime),
    departures: live.filter(r => key(r.checkOut) === today && key(r.checkIn) !== today && ['checked-in', 'checked-out'].includes(r.status)).sort(byTime),
    inHouse: live.filter(r => r.status === 'checked-in' && key(r.checkIn) < today && key(r.checkOut) > today).sort(byTime),
  };
}

export function printDailySheet(reservations, { staffName = '' } = {}) {
  const sheet = getDailySheet(reservations);
  const printed = new Date().toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Manila' });
  const dayLabel = new Date(`${sheet.today}T00:00:00`).toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  const owed = r => Math.max(0, getOutstandingBalance(r));

  const table = (title, rows, columns) => `
    <h2>${esc(title)} <span>(${rows.length})</span></h2>
    ${rows.length === 0 ? '<p class="none">None.</p>' : `<table>
      <thead><tr>${columns.map(col => `<th>${esc(col[0])}</th>`).join('')}<th class="tick">✓</th></tr></thead>
      <tbody>${rows.map(r => `<tr>${columns.map(col => `<td>${col[1](r)}</td>`).join('')}<td class="tick"></td></tr>`).join('')}</tbody>
    </table>`}`;

  const common = [
    ['Ref', r => `#${esc(r.id.slice(0, 8).toUpperCase())}`],
    ['Guest', r => `<strong>${esc(r.guestName || 'Guest')}</strong><br><small>${esc(r.phone || '')}</small>`],
    ['Room / cottage', r => esc(place(r))],
    ['Pax', r => esc(guests(r))],
  ];
  const money = [
    ['Paid', r => esc(peso(r.amountPaid))],
    ['Balance', r => (owed(r) > 0 ? `<strong class="owe">${esc(peso(owed(r)))}</strong>` : 'Paid')],
  ];
  const totalOwed = [...sheet.arrivals, ...sheet.inHouse, ...sheet.departures].reduce((sum, r) => sum + owed(r), 0);

  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Front desk sheet ${esc(sheet.today)}</title>
<style>
  @page { size: A4 landscape; margin: 10mm; }
  body { font: 11px/1.4 Arial, sans-serif; color: #111; margin: 0; padding: 16px; }
  header { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 2px solid #163c2b; padding-bottom: 8px; margin-bottom: 10px; }
  h1 { font-size: 17px; margin: 0; color: #163c2b; } h1 small { display: block; font-size: 11px; color: #555; font-weight: normal; }
  .summary { display: flex; gap: 8px; margin: 6px 0 4px; } .summary div { border: 1px solid #b7c5bb; padding: 5px 9px; }
  h2 { font-size: 13px; margin: 14px 0 5px; color: #163c2b; } h2 span { color: #555; font-weight: normal; }
  table { width: 100%; border-collapse: collapse; } th { background: #163c2b; color: #fff; text-align: left; padding: 4px 6px; font-size: 10.5px; }
  td { border: 1px solid #cbd5d0; padding: 4px 6px; vertical-align: top; } tr:nth-child(even) td { background: #f3f6f4; }
  .tick { width: 26px; text-align: center; } .owe { color: #b91c1c; } .none { color: #666; margin: 0; } small { color: #555; }
  footer { margin-top: 14px; font-size: 10px; color: #555; display: flex; justify-content: space-between; }
  * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
</style></head><body>
  <header>
    <h1>Front desk sheet · ${esc(dayLabel)}<small>Lawiswis Kawayan Garden Resort · printed ${esc(printed)}${staffName ? ` by ${esc(staffName)}` : ''}</small></h1>
    <div class="summary"><div>Arrivals <strong>${sheet.arrivals.length}</strong></div><div>Departures <strong>${sheet.departures.length}</strong></div><div>In house <strong>${sheet.inHouse.length}</strong></div><div>Still owed <strong>${esc(peso(totalOwed))}</strong></div></div>
  </header>
  ${table('Arrivals today', sheet.arrivals, [...common, ['Check-in', r => esc(r.checkInTime || '—')], ['Status', r => esc(r.status)], ...money])}
  ${table('Departures today', sheet.departures, [...common, ['Check-out', r => esc(r.checkOutTime || '—')], ['Status', r => esc(r.status)], ...money])}
  ${table('In house (staying over)', sheet.inHouse, [...common, ['Check-out', r => esc(`${r.checkOut || ''} ${r.checkOutTime || ''}`)], ...money])}
  <footer><span>If the system is offline: tick each guest as they arrive or leave, and write payments by hand. Enter them in the system once it's back.</span><span>Page printed from the HuaPro staff portal</span></footer>
  <script>window.onload = function () { window.print(); };</script>
</body></html>`;
  const win = window.open('', '_blank', 'width=1000,height=800');
  if (!win) return false;
  win.document.open();
  win.document.write(html);
  win.document.close();
  return true;
}
