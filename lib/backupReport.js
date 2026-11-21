// The PDF that comes with the daily backup email: backup details, how to
// restore, a summary, and a readable copy of every record.
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { BACKUP_COLLECTIONS, NOT_BACKED_UP } from './backupData';

const PAGE = [842, 595]; // A4 landscape
const MARGIN = 36;
const WIDTH = PAGE[0] - MARGIN * 2;
const TOP = PAGE[1] - 58;
const BOTTOM = 44;

const COLOR = {
  ink: rgb(0.12, 0.16, 0.22),
  muted: rgb(0.42, 0.45, 0.5),
  brand: rgb(0.075, 0.306, 0.369), // #134E5E
  leaf: rgb(0.443, 0.698, 0.502), // #71B280
  line: rgb(0.86, 0.88, 0.9),
  zebra: rgb(0.96, 0.975, 0.965),
  white: rgb(1, 1, 1),
  warn: rgb(0.7, 0.25, 0.1),
};

// ---- Values -----------------------------------------------------------------

const MANILA = 'Asia/Manila';

const asDate = value => {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === 'object' && value.__timestamp) return new Date(value.__timestamp);
  if (typeof value === 'object' && typeof value.seconds === 'number') return new Date(value.seconds * 1000);
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return new Date(`${value}T00:00:00+08:00`);
  if (typeof value === 'string' || typeof value === 'number') {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  return null;
};

export const formatDate = (value, withTime = false) => {
  const date = asDate(value);
  if (!date) return typeof value === 'string' ? value : '';
  return date.toLocaleString('en-US', {
    timeZone: MANILA, month: 'short', day: 'numeric', year: 'numeric',
    ...(withTime ? { hour: 'numeric', minute: '2-digit' } : {}),
  });
};

export const formatMoney = value => {
  const number = Number(value);
  if (value === null || value === undefined || value === '' || !Number.isFinite(number)) return '';
  return `PHP ${number.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const formatBytes = bytes => (bytes >= 1048576 ? `${(bytes / 1048576).toFixed(2)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);
const pick = (row, ...keys) => {
  for (const key of keys) {
    const value = key.split('.').reduce((node, part) => (node == null ? node : node[part]), row);
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return '';
};
const text = value => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object' && value.__timestamp) return formatDate(value, true);
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (Array.isArray(value)) return value.map(text).filter(Boolean).join(', ');
  if (typeof value === 'object') return '';
  return String(value);
};
const shortRef = id => `#${String(id || '').slice(0, 8).toUpperCase()}`;
const reservationTotal = row => Number(row.totalAmount || 0) + (Number(row.extraCharges) || 0);
const titleCase = value => String(value || '').replace(/[-_]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

// A short "field: value" line for records without their own columns.
// Never prints passwords, tokens or photo data.
const HIDDEN = /token|hash|password|secret|photo|image|avatar|data:|base64/i;
export function summarize(row, skip = []) {
  return Object.entries(row)
    .filter(([key, value]) => key !== 'id' && !skip.includes(key) && !HIDDEN.test(key) && value !== null && value !== '' && !(typeof value === 'string' && value.startsWith('data:')))
    .map(([key, value]) => {
      const shown = text(value);
      return shown ? `${key}: ${shown.length > 80 ? `${shown.slice(0, 77)}...` : shown}` : '';
    })
    .filter(Boolean)
    .slice(0, 10)
    .join('; ');
}

// ---- What each section shows ------------------------------------------------

const byNewest = (...keys) => (a, b) => (asDate(pick(b, ...keys))?.getTime() || 0) - (asDate(pick(a, ...keys))?.getTime() || 0);

const SECTIONS = {
  reservations: {
    sort: byNewest('checkIn', 'createdAt'),
    columns: [
      ['Ref', 0.07, r => shortRef(r.id)],
      ['Guest', 0.12, r => pick(r, 'guestName', 'companyName', 'name')],
      ['Contact', 0.2, r => [pick(r, 'phone'), pick(r, 'email'), pick(r, 'contactLink')].filter(Boolean).join(' / ')],
      ['Room', 0.08, r => pick(r, 'roomNumber', 'roomName', 'cottageName')],
      ['Check-in', 0.075, r => formatDate(r.checkIn)],
      ['Check-out', 0.075, r => formatDate(r.checkOut)],
      ['Guests', 0.04, r => text(pick(r, 'numberOfGuests', 'guests', 'guestCount')) || String((Number(r.adults) || 0) + (Number(r.children) || 0) || '')],
      ['Type', 0.055, r => titleCase(pick(r, 'type', 'bookingType'))],
      ['Status', 0.065, r => titleCase(r.status)],
      ['Total', 0.075, r => formatMoney(reservationTotal(r))],
      ['Paid', 0.075, r => formatMoney(r.amountPaid || 0)],
      ['Booked', 0.07, r => formatDate(r.createdAt)],
    ],
  },
  payments: {
    sort: byNewest('createdAt', 'paidAt', 'date', 'timestamp'),
    columns: [
      ['Date', 0.12, r => formatDate(pick(r, 'createdAt', 'paidAt', 'date', 'timestamp'), true)],
      ['Booking', 0.08, r => (r.reservationId ? shortRef(r.reservationId) : '')],
      ['Guest', 0.15, r => pick(r, 'guestName', 'name')],
      ['Room', 0.1, r => pick(r, 'roomNumber', 'roomName')],
      ['Method', 0.1, r => titleCase(pick(r, 'method', 'paymentMethod'))],
      ['Amount', 0.1, r => formatMoney(pick(r, 'amount', 'amountPaid'))],
      ['Received by', 0.12, r => pick(r, 'recordedByName', 'staffName', 'provider')],
      ['Reference', 0.23, r => pick(r, 'referenceNumber', 'paymentId', 'checkoutSessionId', 'notes')],
    ],
  },
  refunds: {
    sort: byNewest('createdAt', 'requestedAt'),
    columns: [
      ['Date', 0.13, r => formatDate(pick(r, 'createdAt', 'requestedAt'), true)],
      ['Booking', 0.09, r => (r.reservationId ? shortRef(r.reservationId) : '')],
      ['Guest', 0.16, r => pick(r, 'guestName', 'name')],
      ['Amount', 0.11, r => formatMoney(pick(r, 'amount', 'refundAmount'))],
      ['Status', 0.1, r => titleCase(r.status)],
      ['Reason / details', 0.41, r => pick(r, 'reason', 'notes') || summarize(r, ['reservationId', 'guestName', 'amount', 'status', 'createdAt'])],
    ],
  },
  rooms: {
    sort: (a, b) => String(pick(a, 'name', 'roomNumber')).localeCompare(String(pick(b, 'name', 'roomNumber'))),
    columns: [
      ['Room', 0.14, r => pick(r, 'name', 'roomNumber', 'roomName')],
      ['Type', 0.12, r => titleCase(pick(r, 'type', 'category', 'roomType'))],
      ['Capacity', 0.08, r => text(pick(r, 'capacity', 'maxGuests', 'maxOccupancy'))],
      ['Rate', 0.11, r => formatMoney(pick(r, 'price', 'rate', 'pricePerNight', 'nightlyRate'))],
      ['Location', 0.15, r => pick(r, 'location', 'floor')],
      ['Status', 0.1, r => titleCase(pick(r, 'status', 'availability'))],
      ['Description', 0.3, r => pick(r, 'description')],
    ],
  },
  users: {
    sort: (a, b) => String(pick(a, 'role')).localeCompare(String(pick(b, 'role'))),
    columns: [
      ['Name', 0.22, r => pick(r, 'name', 'displayName', 'fullName')],
      ['Email', 0.28, r => pick(r, 'email')],
      ['Role', 0.14, r => titleCase(r.role)],
      ['Status', 0.14, r => (r.disabled || r.status === 'disabled' ? 'Disabled' : titleCase(r.status) || 'Active')],
      ['Added', 0.22, r => formatDate(pick(r, 'createdAt'), true)],
    ],
  },
  promoCodes: {
    sort: byNewest('createdAt', 'startDate'),
    columns: [
      ['Code', 0.14, r => pick(r, 'code', 'id')],
      ['Discount', 0.14, r => {
        const value = pick(r, 'discountValue', 'discount', 'value', 'percent');
        const type = String(pick(r, 'discountType', 'type')).toLowerCase();
        return value === '' ? '' : type.includes('fix') || type.includes('amount') ? formatMoney(value) : `${value}%`;
      }],
      ['Starts', 0.12, r => formatDate(pick(r, 'startDate', 'validFrom'))],
      ['Ends', 0.12, r => formatDate(pick(r, 'endDate', 'expiryDate', 'validUntil'))],
      ['Active', 0.08, r => text(pick(r, 'active', 'isActive'))],
      ['Used', 0.08, r => text(pick(r, 'usedCount', 'timesUsed', 'uses'))],
      ['Details', 0.32, r => pick(r, 'description') || summarize(r, ['code', 'discountValue', 'discountType', 'startDate', 'endDate', 'active', 'usedCount', 'createdAt'])],
    ],
  },
  feedback: {
    sort: byNewest('createdAt'),
    columns: [
      ['Date', 0.12, r => formatDate(r.createdAt, true)],
      ['Guest', 0.15, r => (r.isAnonymous ? 'Anonymous' : pick(r, 'guestName', 'name'))],
      ['Room', 0.1, r => pick(r, 'roomName', 'roomNumber')],
      ['Rating', 0.07, r => text(r.rating)],
      ['Comment', 0.56, r => pick(r, 'comment', 'message')],
    ],
  },
  contacts: {
    sort: byNewest('createdAt'),
    columns: [
      ['Date', 0.12, r => formatDate(r.createdAt, true)],
      ['Name', 0.14, r => pick(r, 'name', 'firstName')],
      ['Email / phone', 0.18, r => [pick(r, 'email'), pick(r, 'phone')].filter(Boolean).join(' / ')],
      ['Subject', 0.14, r => pick(r, 'subject')],
      ['Status', 0.08, r => titleCase(r.status)],
      ['Message', 0.34, r => pick(r, 'message')],
    ],
  },
  conversations: {
    sort: byNewest('updatedAt', 'lastMessageAt', 'createdAt'),
    columns: [
      ['Started', 0.13, r => formatDate(r.createdAt, true)],
      ['Guest', 0.17, r => pick(r, 'guestName', 'name')],
      ['Contact', 0.2, r => [pick(r, 'guestEmail', 'email'), pick(r, 'guestPhone', 'phone')].filter(Boolean).join(' / ')],
      ['Last message', 0.36, r => pick(r, 'lastMessage', 'lastMessageText')],
      ['Updated', 0.14, r => formatDate(pick(r, 'updatedAt', 'lastMessageAt'), true)],
    ],
  },
  conversationMessages: {
    sort: (a, b) => String(a.conversationId).localeCompare(String(b.conversationId))
      || (asDate(pick(a, 'createdAt', 'timestamp'))?.getTime() || 0) - (asDate(pick(b, 'createdAt', 'timestamp'))?.getTime() || 0),
    columns: [
      ['Chat', 0.09, r => shortRef(r.conversationId)],
      ['Sent', 0.13, r => formatDate(pick(r, 'createdAt', 'timestamp'), true)],
      ['From', 0.14, r => pick(r, 'senderName', 'staffName', 'sender', 'from', 'role')],
      ['Message', 0.64, r => pick(r, 'text', 'message', 'body')],
    ],
  },
  news: {
    sort: byNewest('publishedAt', 'createdAt', 'date'),
    columns: [
      ['Date', 0.13, r => formatDate(pick(r, 'publishedAt', 'date', 'createdAt'))],
      ['Title', 0.3, r => pick(r, 'title')],
      ['Status', 0.1, r => titleCase(pick(r, 'status', 'published'))],
      ['Summary', 0.47, r => pick(r, 'excerpt', 'summary', 'body', 'content')],
    ],
  },
  faqs: {
    columns: [
      ['Question', 0.35, r => pick(r, 'question', 'title')],
      ['Answer', 0.65, r => pick(r, 'answer', 'body')],
    ],
  },
  newsletterSubscribers: {
    sort: byNewest('subscribedAt', 'createdAt'),
    columns: [
      ['Email', 0.45, r => pick(r, 'email', 'id')],
      ['Signed up', 0.3, r => formatDate(pick(r, 'subscribedAt', 'createdAt'), true)],
      ['Status', 0.25, r => titleCase(pick(r, 'status')) || (r.unsubscribed ? 'Unsubscribed' : 'Subscribed')],
    ],
  },
};

const genericColumns = [
  ['Record ID', 0.18, r => String(r.id)],
  ['Date', 0.13, r => formatDate(pick(r, 'createdAt', 'timestamp', 'date', 'updatedAt'), true)],
  ['Details', 0.69, r => summarize(r, ['createdAt', 'timestamp', 'date'])],
];

// ---- Drawing ----------------------------------------------------------------

function makeCleaner(font) {
  const supported = new Set(font.getCharacterSet());
  const swaps = { '₱': 'PHP ', '−': '-', ' ': ' ', '\t': ' ' };
  return value => {
    let out = '';
    for (const char of String(value ?? '').replace(/\r?\n|\r/g, ' ')) {
      if (supported.has(char.codePointAt(0))) out += char;
      else if (swaps[char] !== undefined) out += swaps[char];
      else {
        const plain = char.normalize('NFKD').replace(/[̀-ͯ]/g, '');
        // Emoji and other symbols the font lacks are left out.
        out += [...plain].every(c => supported.has(c.codePointAt(0))) ? plain : '';
      }
    }
    return out;
  };
}

function wrap(value, font, size, width, clean, maxLines = Infinity) {
  const words = clean(value).split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  const fits = candidate => font.widthOfTextAtSize(candidate, size) <= width;
  for (let word of words) {
    while (!fits(word)) {
      // Break very long words (links, IDs).
      let cut = word.length - 1;
      while (cut > 1 && !fits(word.slice(0, cut))) cut -= 1;
      if (line) { lines.push(line); line = ''; }
      lines.push(word.slice(0, cut));
      word = word.slice(cut);
    }
    const candidate = line ? `${line} ${word}` : word;
    if (fits(candidate)) line = candidate;
    else { lines.push(line); line = word; }
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    let last = `${kept[maxLines - 1]}...`;
    while (last.length > 3 && !fits(last)) last = `${last.slice(0, -4)}...`;
    kept[maxLines - 1] = last;
    return kept;
  }
  return lines;
}

class Report {
  constructor(doc, regular, bold) {
    Object.assign(this, { doc, regular, bold, clean: makeCleaner(regular) });
    this.page = null;
    this.y = TOP;
  }

  newPage() {
    this.page = this.doc.addPage(PAGE);
    this.y = TOP;
  }

  room(height) {
    if (!this.page || this.y - height < BOTTOM) { this.newPage(); return false; }
    return true;
  }

  write(value, { size = 10, font = this.regular, color = COLOR.ink, x = MARGIN, width = WIDTH, gap = 4 } = {}) {
    wrap(value, font, size, width, this.clean).forEach(line => {
      this.room(size + 2);
      this.page.drawText(line, { x, y: this.y - size, size, font, color });
      this.y -= size + 3;
    });
    this.y -= gap;
  }

  heading(value, size = 15) {
    this.room(size + 40);
    this.y -= 6;
    this.page.drawText(this.clean(value), { x: MARGIN, y: this.y - size, size, font: this.bold, color: COLOR.brand });
    this.y -= size + 8;
    this.page.drawRectangle({ x: MARGIN, y: this.y, width: 46, height: 2.5, color: COLOR.leaf });
    this.y -= 10;
  }

  table(columns, rows, { size = 7.5, maxLines = 4, title } = {}) {
    const widths = columns.map(([, share]) => share * WIDTH);
    const pad = 4;
    const drawHeader = () => {
      const height = size + 9;
      this.page.drawRectangle({ x: MARGIN, y: this.y - height, width: WIDTH, height, color: COLOR.brand });
      let x = MARGIN;
      columns.forEach(([label], index) => {
        this.page.drawText(this.clean(label), { x: x + pad, y: this.y - height + 5, size, font: this.bold, color: COLOR.white });
        x += widths[index];
      });
      this.y -= height;
    };
    if (!this.room(size * 3 + 30)) { /* new page already started */ }
    drawHeader();
    if (!rows.length) {
      this.y -= 4;
      this.write('No records.', { size: 9, color: COLOR.muted });
      return;
    }
    rows.forEach((row, rowIndex) => {
      const cells = columns.map(([, , get], index) => {
        let value;
        try { value = get(row); } catch { value = ''; }
        return wrap(text(value), this.regular, size, widths[index] - pad * 2, this.clean, maxLines);
      });
      const height = Math.max(1, ...cells.map(lines => lines.length)) * (size + 2) + 6;
      if (this.y - height < BOTTOM) {
        this.newPage();
        if (title) {
          this.page.drawText(this.clean(`${title} (continued)`), { x: MARGIN, y: this.y - 11, size: 11, font: this.bold, color: COLOR.brand });
          this.y -= 18;
        }
        drawHeader();
      }
      if (rowIndex % 2 === 1) this.page.drawRectangle({ x: MARGIN, y: this.y - height, width: WIDTH, height, color: COLOR.zebra });
      let x = MARGIN;
      cells.forEach((lines, index) => {
        lines.forEach((line, lineIndex) => {
          this.page.drawText(line, { x: x + pad, y: this.y - 3 - (lineIndex + 1) * (size + 2) + 2, size, font: this.regular, color: COLOR.ink });
        });
        x += widths[index];
      });
      this.y -= height;
      this.page.drawLine({ start: { x: MARGIN, y: this.y }, end: { x: MARGIN + WIDTH, y: this.y }, thickness: 0.4, color: COLOR.line });
    });
    this.y -= 8;
  }

  // Header and footer on every page, added last so "Page 2 of 9" is known.
  frame(dateLabel, backupId) {
    const pages = this.doc.getPages();
    pages.forEach((page, index) => {
      page.drawRectangle({ x: 0, y: PAGE[1] - 30, width: PAGE[0], height: 30, color: COLOR.brand });
      page.drawText('Lawiswis Kawayan Garden Resort  |  Daily Data Backup', { x: MARGIN, y: PAGE[1] - 20, size: 10, font: this.bold, color: COLOR.white });
      const right = this.clean(`${formatDate(dateLabel)}  |  ${backupId}`);
      page.drawText(right, { x: PAGE[0] - MARGIN - this.regular.widthOfTextAtSize(right, 9), y: PAGE[1] - 20, size: 9, font: this.regular, color: COLOR.white });
      page.drawLine({ start: { x: MARGIN, y: 30 }, end: { x: PAGE[0] - MARGIN, y: 30 }, thickness: 0.5, color: COLOR.line });
      page.drawText('CONFIDENTIAL: contains guest personal data (Data Privacy Act of 2012). Do not forward or print for others.', { x: MARGIN, y: 18, size: 7.5, font: this.regular, color: COLOR.muted });
      const number = `Page ${index + 1} of ${pages.length}`;
      page.drawText(number, { x: PAGE[0] - MARGIN - this.regular.widthOfTextAtSize(number, 8), y: 18, size: 8, font: this.regular, color: COLOR.muted });
    });
  }
}

// ---- The report -------------------------------------------------------------

export function backupIdFor(dateLabel, sha256) {
  return `LKGR-${String(dateLabel).replace(/-/g, '')}-${String(sha256).slice(0, 8).toUpperCase()}`;
}

/**
 * data:     { collectionName: [records] } (from readBackupData)
 * counts:   { collectionName: number }
 * failed:   [{ name, error }] collections that could not be read
 * dataFile: { name, sizeBytes, sha256 } the restorable .json.gz file
 * Returns the PDF as a Uint8Array.
 */
export async function buildBackupPdf({ data, counts, failed = [], createdAt = new Date(), dateLabel, dataFile, projectId = '' }) {
  const doc = await PDFDocument.create();
  const backupId = backupIdFor(dateLabel, dataFile.sha256);
  doc.setTitle(`Lawiswis daily backup ${dateLabel}`);
  doc.setAuthor('Lawiswis Kawayan Garden Resort reservation system');
  doc.setSubject(`Backup ${backupId}`);
  doc.setCreationDate(createdAt);
  const report = new Report(doc, await doc.embedFont(StandardFonts.Helvetica), await doc.embedFont(StandardFonts.HelveticaBold));
  const total = Object.values(counts).reduce((sum, count) => sum + Number(count || 0), 0);
  const labelOf = name => BACKUP_COLLECTIONS.find(item => item.name === name)?.label || name;

  // Page 1: backup details.
  report.newPage();
  report.write('Daily Data Backup', { size: 22, font: report.bold, color: COLOR.brand, gap: 2 });
  report.write(`Reservation system backup for ${formatDate(dateLabel)}`, { size: 11, color: COLOR.muted, gap: 10 });

  report.heading('Backup information', 13);
  const status = failed.length
    ? `INCOMPLETE: ${failed.map(item => labelOf(item.name)).join(', ')} could not be read. Everything else was saved.`
    : 'Complete: every collection was read successfully.';
  report.table([
    ['Item', 0.22, row => row[0]],
    ['Details', 0.78, row => row[1]],
  ], [
    ['Backup ID', backupId],
    ['Backup date', `${formatDate(dateLabel)} (Philippine time)`],
    ['Created at', formatDate(createdAt, true)],
    ['Made by', 'Automatic daily backup (runs every morning at 9:00 AM)'],
    ['Source', `Reservation system database${projectId ? ` (Firebase project ${projectId})` : ''}`],
    ['Records saved', `${total.toLocaleString('en-PH')} records in ${BACKUP_COLLECTIONS.length} collections`],
    ['Status', status],
    ['Not included', NOT_BACKED_UP],
  ], { size: 9, maxLines: 6 });

  report.heading('Files in this backup', 13);
  report.table([
    ['File', 0.27, row => row[0]],
    ['What it is', 0.33, row => row[1]],
    ['Size', 0.08, row => row[2]],
    ['SHA-256 checksum (to confirm the file is unchanged)', 0.32, row => row[3]],
  ], [
    [dataFile.name, 'Full copy of the data. This is the file used to restore the system.', formatBytes(dataFile.sizeBytes), dataFile.sha256],
    [`lawiswis-backup-${dateLabel}.pdf`, 'This report: a readable copy of every record for staff and auditors.', '', ''],
  ], { size: 8.5, maxLines: 4 });

  report.heading('What is saved', 13);
  report.table([
    ['Collection', 0.2, row => row.label],
    ['What it holds', 0.62, row => row.about],
    ['Records', 0.18, row => (failed.some(item => item.name === row.name) ? 'Could not be read' : Number(counts[row.name] || 0).toLocaleString('en-PH'))],
  ], BACKUP_COLLECTIONS, { size: 8.5 });

  // Summary.
  const reservations = data.reservations || [];
  const statusCounts = reservations.reduce((all, row) => { const key = titleCase(row.status || 'unknown'); all[key] = (all[key] || 0) + 1; return all; }, {});
  const now = createdAt.getTime();
  const nextWeek = reservations.filter(row => {
    const date = asDate(row.checkIn)?.getTime();
    return date && date >= now - 86400000 && date <= now + 7 * 86400000 && !/cancel|no.?show/i.test(row.status || '');
  });
  const activeBalance = reservations
    .filter(row => !/cancel|no.?show|checked.?out|completed/i.test(row.status || ''))
    .reduce((sum, row) => sum + Math.max(0, reservationTotal(row) - Number(row.amountPaid || 0)), 0);
  const paymentsTotal = (data.payments || []).reduce((sum, row) => sum + (Number(pick(row, 'amount', 'amountPaid')) || 0), 0);
  report.heading('Summary at the time of backup', 13);
  report.table([
    ['Figure', 0.4, row => row[0]],
    ['Value', 0.6, row => row[1]],
  ], [
    ['Reservations by status', Object.entries(statusCounts).sort((a, b) => b[1] - a[1]).map(([key, count]) => `${key}: ${count}`).join(', ') || 'None'],
    ['Check-ins in the next 7 days', String(nextWeek.length)],
    ['Unpaid balance on open bookings', formatMoney(activeBalance)],
    ['Payments on record', `${(data.payments || []).length} payment${(data.payments || []).length === 1 ? '' : 's'}, ${formatMoney(paymentsTotal)} in total`],
  ], { size: 9 });

  report.heading('How to use and restore this backup', 13);
  [
    '1. Keep this email. The .json.gz file is the full backup; this PDF is the readable copy. Both are needed for a complete record.',
    '2. To check a file is unchanged, compare its SHA-256 checksum with the one above (Windows: certutil -hashfile <file> SHA256).',
    '3. To restore, the system administrator runs: node scripts/restore-backup.mjs <file>.json.gz. It first shows what it would do without changing anything.',
    '4. Adding --write puts back records that are missing. Records that still exist are left alone unless --overwrite is added, so newer bookings are never lost.',
    '5. Backups are made every morning. Keep at least the last 30 days and delete older backup emails.',
    '6. This backup holds guest names, phone numbers and emails. Keep it in the resort Gmail only, do not forward it, and shred any printed copy.',
  ].forEach(line => report.write(line, { size: 9.5, gap: 1 }));

  // One section per collection, starting on a fresh page and then flowing
  // on so empty collections don't each take a page.
  report.newPage();
  BACKUP_COLLECTIONS.forEach(({ name, label, about }, index) => {
    const rows = [...(data[name] || [])];
    const section = SECTIONS[name] || { columns: genericColumns };
    if (section.sort) rows.sort(section.sort);
    if (index > 0) { report.y -= 14; report.room(110); }
    report.heading(`${label} (${rows.length.toLocaleString('en-PH')})`);
    report.write(about, { size: 9, color: COLOR.muted, gap: 6 });
    if (failed.some(item => item.name === name)) report.write('This collection could not be read for this backup.', { size: 9, color: COLOR.warn });
    report.table(section.columns, rows, { title: label });
  });

  report.frame(dateLabel, backupId);
  return doc.save();
}
