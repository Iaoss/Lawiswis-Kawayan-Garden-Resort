/**
 * @jest-environment node
 */
import fs from 'fs';
import { PDFDocument } from 'pdf-lib';
import { readBackupData, toBackupValue, BACKUP_COLLECTIONS } from '../../lib/backupData';
import { buildBackupPdf, backupIdFor, summarize, formatMoney } from '../../lib/backupReport';

const stamp = iso => ({ toDate: () => new Date(iso) });
const doc = (id, data, parentPath) => ({
  id,
  data: () => data,
  ref: { parent: parentPath ? { parent: { id: parentPath[1], parent: { id: parentPath[0] } } } : null },
});

describe('backup data', () => {
  it('keeps dates as dates so a restore can put them back', () => {
    expect(toBackupValue({ at: stamp('2026-11-19T01:00:00.000Z'), list: [stamp('2026-01-01T00:00:00.000Z')], n: 2 }))
      .toEqual({ at: { __timestamp: '2026-11-19T01:00:00.000Z' }, list: [{ __timestamp: '2026-01-01T00:00:00.000Z' }], n: 2 });
  });

  it('reads every collection, chat messages from their conversations, and carries on past a failure', async () => {
    const db = {
      collection: name => ({
        get: async () => {
          if (name === 'tasks') throw new Error('Quota exceeded');
          return { docs: name === 'reservations' ? [doc('r1', { guestName: 'Ana', createdAt: stamp('2026-11-01T00:00:00Z') })] : [] };
        },
      }),
      collectionGroup: () => ({
        get: async () => ({ docs: [doc('m1', { text: 'Hello' }, ['conversations', 'c1']), doc('x', { text: 'other' }, ['elsewhere', 'z'])] }),
      }),
    };
    const { data, counts, failed } = await readBackupData(db);
    expect(Object.keys(counts)).toHaveLength(BACKUP_COLLECTIONS.length);
    expect(data.reservations[0]).toEqual({ id: 'r1', guestName: 'Ana', createdAt: { __timestamp: '2026-11-01T00:00:00.000Z' } });
    expect(data.conversationMessages).toEqual([{ id: 'm1', conversationId: 'c1', text: 'Hello' }]);
    expect(failed).toEqual([{ name: 'tasks', error: 'Quota exceeded' }]);
  });
});

describe('backup PDF', () => {
  it('never prints tokens or photo data in record details', () => {
    const line = summarize({ id: 'a', note: 'ok', tokenHash: 'abc', photo: 'data:image/jpeg;base64,AAA', other: 'data:xyz' });
    expect(line).toBe('note: ok');
  });

  it('builds a multi-page report that handles peso signs, accents, emoji and long links', async () => {
    const reservations = Array.from({ length: 120 }, (_, i) => ({
      id: `res${String(i).padStart(5, '0')}abcdef`,
      guestName: i % 2 ? 'José Peñaflor 😀' : 'Ana Cruz',
      email: 'guest@example.com',
      phone: '09171234567',
      contactLink: 'https://www.facebook.com/a.very.long.profile.link.that.keeps.going.and.going.forever',
      roomNumber: 'Dilag',
      checkIn: '2026-11-20',
      checkOut: '2026-11-21',
      adults: 2,
      type: 'online',
      status: i % 3 ? 'confirmed' : 'cancelled',
      totalAmount: 4000,
      extraCharges: -800,
      amountPaid: 1600,
      notes: 'Paid ₱1,600 deposit',
      createdAt: { __timestamp: '2026-11-01T02:00:00.000Z' },
    }));
    const data = Object.fromEntries(BACKUP_COLLECTIONS.map(({ name }) => [name, []]));
    data.reservations = reservations;
    data.payments = [{ id: 'p1', reservationId: 'res00001abcdef', guestName: 'Ana', amount: 1600, method: 'gcash', createdAt: { __timestamp: '2026-11-02T02:00:00.000Z' } }];
    data.settings = [{ id: 'resort', checkInTime: '2:00 PM', closures: ['2026-12-25'] }];
    const counts = Object.fromEntries(Object.entries(data).map(([name, rows]) => [name, rows.length]));
    const sha256 = 'a'.repeat(64);
    const bytes = await buildBackupPdf({
      data, counts, failed: [{ name: 'tasks', error: 'x' }],
      createdAt: new Date('2026-11-19T01:00:00Z'), dateLabel: '2026-11-19',
      dataFile: { name: 'lawiswis-backup-2026-11-19.json.gz', sizeBytes: 20480, sha256 },
      projectId: 'demo-project',
    });
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBeGreaterThan(5); // 120 bookings need several pages
    expect(pdf.getTitle()).toBe('Lawiswis daily backup 2026-11-19');
    expect(pdf.getSubject()).toBe(`Backup ${backupIdFor('2026-11-19', sha256)}`);
    if (process.env.BACKUP_SAMPLE) fs.writeFileSync(process.env.BACKUP_SAMPLE, bytes);
  });

  it('formats money without the peso glyph the PDF font lacks', () => {
    expect(formatMoney(3200)).toBe('PHP 3,200.00');
    expect(formatMoney('')).toBe('');
  });
});
