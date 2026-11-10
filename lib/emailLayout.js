// lib/emailLayout.js
//
// One formal, easy-to-read layout for every guest email: a letterhead, a
// title, "Dear <name>," then short paragraphs, a details table, an optional
// button, a signature and the resort's contact footer. Built with tables and
// inline styles so it looks the same in Gmail, Outlook and phone mail apps.

const BRAND = '#1a3a1a';
const ACCENT = '#9cb56f';
const INK = '#1f2937';
const MUTED = '#6b7280';
const LINE = '#e5e7eb';
const FONT = "Arial, 'Helvetica Neue', Helvetica, sans-serif";

export const RESORT = {
  name: 'Lawiswis Kawayan Garden Resort',
  address: '402 Brgy. Buguion, Calumpit, Bulacan, Philippines',
  phone: '0917 811 2332',
  site: process.env.PUBLIC_SITE_URL || 'https://lawiswis-kawayan-garden-resort.vercel.app',
};

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[character]));
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// "2026-11-28" -> "Saturday, November 28, 2026". Other values pass through.
export function longDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value || ''));
  if (!match) return String(value || '—');
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const weekday = DAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${weekday}, ${MONTHS[m - 1]} ${d}, ${y}`;
}

export const peso = value => {
  const n = Number(value || 0);
  return `${n < 0 ? '−' : ''}₱${Math.abs(n).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

// Rows: [label, valueHtml, { strong }] — values must already be escaped.
export function detailsTable(rows, title = '') {
  const body = rows.filter(Boolean).map(([label, value, options = {}], index) => {
    const line = index ? `border-top:1px solid ${LINE};` : '';
    const shade = options.strong ? 'background:#f9faf8;font-weight:700;' : '';
    return `
      <tr>
        <td style="padding:10px 14px;${line}${shade}color:${MUTED};font-size:13px;width:44%;vertical-align:top;">${label}</td>
        <td style="padding:10px 14px;${line}${shade}color:${INK};font-size:14px;text-align:right;vertical-align:top;">${value}</td>
      </tr>`;
  }).join('');
  return `
    ${title ? heading(title) : ''}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:separate;border:1px solid ${LINE};border-radius:8px;margin:${title ? '0' : '18px'} 0 18px;">
      ${body}
    </table>`;
}

export function button(url, label, { secondary = false } = {}) {
  const bg = secondary ? '#f3f4f6' : BRAND;
  const color = secondary ? INK : '#ffffff';
  return `<a href="${escapeHtml(url)}" target="_blank" rel="noopener" style="display:inline-block;background:${bg};color:${color};text-decoration:none;font-weight:700;font-size:14px;padding:13px 22px;border-radius:6px;margin:4px 8px 4px 0;">${label}</a>`;
}

export const paragraph = html => `<p style="margin:0 0 14px;font-size:14px;line-height:1.7;color:${INK};">${html}</p>`;

export const list = items => `<ul style="margin:0 0 16px;padding-left:20px;font-size:14px;line-height:1.7;color:${INK};">${items.filter(Boolean).map(item => `<li style="margin-bottom:4px;">${item}</li>`).join('')}</ul>`;

export const heading = text => `<p style="margin:22px 0 8px;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:${BRAND};">${text}</p>`;

// A shaded box for important notes. tone: info | warning | success
export function notice(html, tone = 'info') {
  const colors = { info: ['#f1f5ee', BRAND], warning: ['#fef3c7', '#92400e'], success: ['#ecfdf5', '#166534'] }[tone] || ['#f1f5ee', BRAND];
  return `<div style="background:${colors[0]};border-left:4px solid ${colors[1]};padding:12px 14px;margin:0 0 16px;font-size:13px;line-height:1.6;color:${INK};">${html}</div>`;
}

export const small = html => `<p style="margin:0 0 10px;font-size:12px;line-height:1.6;color:${MUTED};">${html}</p>`;

// The whole email. All parts except `preheader` and `title` are HTML.
export function renderEmail({ preheader = '', title, guestName = '', body, signOff = true, footerNote = 'This message was sent to you about your booking. To reply, simply answer this email.' }) {
  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(title)}</title></head>
<body style="margin:0;padding:0;background:#f3f5f2;">
  <span style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(preheader)}</span>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f5f2;">
    <tr><td align="center" style="padding:24px 12px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border:1px solid ${LINE};border-radius:10px;overflow:hidden;font-family:${FONT};">
        <tr><td style="background:${BRAND};padding:22px 28px;">
          <div style="font-size:18px;font-weight:700;letter-spacing:.04em;color:#ffffff;">${RESORT.name}</div>
          <div style="font-size:12px;color:${ACCENT};margin-top:3px;">Calumpit, Bulacan</div>
        </td></tr>
        <tr><td style="padding:28px 28px 8px;">
          <h1 style="margin:0 0 18px;font-size:21px;line-height:1.35;color:${BRAND};font-weight:700;">${escapeHtml(title)}</h1>
          ${guestName ? paragraph(`Dear ${escapeHtml(guestName)},`) : ''}
          ${body}
          ${signOff ? `
          <p style="margin:24px 0 4px;font-size:14px;color:${INK};">Sincerely,</p>
          <p style="margin:0 0 20px;font-size:14px;color:${INK};"><strong>The Front Office Team</strong><br>${RESORT.name}</p>` : ''}
        </td></tr>
        <tr><td style="background:#f9faf8;border-top:1px solid ${LINE};padding:18px 28px;font-size:12px;line-height:1.7;color:${MUTED};">
          <strong style="color:${INK};">${RESORT.name}</strong><br>
          ${RESORT.address}<br>
          Mobile: ${RESORT.phone}${process.env.GMAIL_USER ? ` · Email: ${escapeHtml(process.env.GMAIL_USER)}` : ''}<br>
          <a href="${escapeHtml(RESORT.site)}" style="color:${BRAND};">${escapeHtml(RESORT.site.replace(/^https?:\/\//, ''))}</a>
          <div style="margin-top:10px;font-size:11px;">${escapeHtml(footerNote)}</div>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}
