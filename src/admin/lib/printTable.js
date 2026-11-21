// Opens a clean printable page with one table: a title, the filters used,
// who printed it and when, then the rows. Used by the Activity Log and the
// Reports custom list. Returns false when the browser blocked the window.

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function printTable({ title, subtitle = '', filters = [], columns, rows, printedBy = '', landscape = columns.length > 6, note = '' }) {
  const printedAt = new Date().toLocaleString('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short' });
  const filterText = filters.filter(([, value]) => value !== undefined && value !== null && value !== '');
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>
  @page { size: A4 ${landscape ? 'landscape' : 'portrait'}; margin: 12mm; }
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; color: #111; margin: 0; font-size: 10pt; }
  header { border-bottom: 2px solid #173d2a; padding-bottom: 8px; margin-bottom: 10px; }
  .resort { color: #173d2a; font-weight: 700; font-size: 10pt; letter-spacing: .03em; }
  h1 { margin: 2px 0 2px; font-size: 16pt; color: #173d2a; }
  .sub { color: #4b5563; font-size: 9pt; }
  .meta { display: flex; flex-wrap: wrap; gap: 4px 14px; margin-top: 6px; font-size: 8.5pt; color: #374151; }
  .meta b { color: #111; }
  table { width: 100%; border-collapse: collapse; font-size: 8.5pt; }
  thead { display: table-header-group; }
  th { background: #173d2a; color: #fff; text-align: left; padding: 5px 6px; border: 1px solid #173d2a; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  td { padding: 4px 6px; border: 1px solid #cbd5d0; vertical-align: top; overflow-wrap: anywhere; }
  tbody tr:nth-child(even) td { background: #f1f5f2; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  tr { break-inside: avoid; }
  .count { margin: 0 0 6px; font-size: 9pt; font-weight: 700; }
  .empty { padding: 18px; text-align: center; color: #6b7280; border: 1px dashed #cbd5d0; }
  footer { margin-top: 10px; font-size: 8pt; color: #6b7280; }
  .noprint { margin: 0 0 12px; display: flex; gap: 8px; }
  .noprint button { padding: 8px 14px; border: 1px solid #173d2a; background: #173d2a; color: #fff; border-radius: 6px; cursor: pointer; font-size: 10pt; }
  .noprint button.light { background: #fff; color: #173d2a; }
  @media print { .noprint { display: none; } }
</style></head><body>
<div class="noprint"><button onclick="window.print()">Print</button><button class="light" onclick="window.close()">Close</button></div>
<header>
  <div class="resort">LAWISWIS KAWAYAN GARDEN RESORT</div>
  <h1>${esc(title)}</h1>
  ${subtitle ? `<div class="sub">${esc(subtitle)}</div>` : ''}
  <div class="meta">
    <span><b>Printed:</b> ${esc(printedAt)}</span>
    ${printedBy ? `<span><b>Printed by:</b> ${esc(printedBy)}</span>` : ''}
    ${filterText.map(([label, value]) => `<span><b>${esc(label)}:</b> ${esc(value)}</span>`).join('')}
  </div>
</header>
<p class="count">${rows.length} record${rows.length === 1 ? '' : 's'}</p>
${rows.length ? `<table><thead><tr>${columns.map(c => `<th>${esc(c)}</th>`).join('')}</tr></thead>
<tbody>${rows.map(row => `<tr>${row.map(cell => `<td>${esc(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table>`
    : '<div class="empty">No records match these filters.</div>'}
<footer>${note ? `${esc(note)} ` : ''}Confidential: contains guest and staff information. Handle under the Data Privacy Act of 2012.</footer>
<script>window.onload = function () { setTimeout(function () { window.print(); }, 350); };</script>
</body></html>`;
  const win = window.open('', '_blank', 'width=1000,height=800');
  if (!win) return false;
  win.document.open();
  win.document.write(html);
  win.document.close();
  return true;
}
