// Daily jobs (Vercel cron, see vercel.json: 9 AM and 6 PM Philippine time).
//
// Every run: emails guests whose check-in is tomorrow (once each; the
// evening run catches bookings made after the morning run).
// Morning run only:
//   - no-shows: confirmed/pending bookings whose check-in date has passed
//     without a check-in are cancelled as no-shows (the policy fee applies);
//   - unpaid online bookings whose room hold ran out a day ago or more are
//     cancelled ("not paid in time");
//   - a backup of the data is emailed to the resort's Gmail.
//
// Vercel calls this with the CRON_SECRET password (set it in the Vercel
// project's environment variables).
import zlib from 'zlib';
import { adminDb, FieldValue } from '../lib/firebaseAdmin';
import { sendArrivalReminderEmail, sendBackupEmail } from '../lib/email';
import { cancelBooking, canMarkNoShow } from '../lib/cancelBooking';
import { logActivity } from '../lib/activityLog';
import { getHoldExpiresMs } from '../src/lib/unpaidBookings';

const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000;
const SYSTEM = { uid: 'system', name: 'Automatic daily check', email: '', role: 'system' };
const BACKUP_COLLECTIONS = ['reservations', 'payments', 'rooms', 'users', 'settings', 'feedback', 'contacts', 'promoCodes', 'news', 'newsletterSubscribers'];

const manilaKey = (offsetDays = 0) => {
  const date = new Date(Date.now() + MANILA_OFFSET_MS);
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return date.toISOString().slice(0, 10);
};
const ref = id => `#${String(id).slice(0, 8).toUpperCase()}`;
const peso = value => `₱${Number(value || 0).toLocaleString('en-PH')}`;

async function sendReminders() {
  const target = manilaKey(1);
  let sent = 0;
  let failed = 0;
  const snapshot = await adminDb.collection('reservations').where('checkIn', '==', target).get();
  for (const document of snapshot.docs) {
    const reservation = document.data();
    const email = reservation.email || reservation.guestEmail;
    if (!email || reservation.status !== 'confirmed' || reservation.arrivalReminderSent) continue;
    try {
      await sendArrivalReminderEmail({ id: document.id, ...reservation }, document.id.slice(0, 8).toUpperCase());
      await document.ref.update({ arrivalReminderSent: true, arrivalReminderSentAt: FieldValue.serverTimestamp() });
      sent += 1;
    } catch (error) {
      console.error('Arrival reminder failed:', document.id, error);
      failed += 1;
    }
  }
  return { date: target, sent, failed };
}

// No-shows and expired unpaid holds.
async function closeMissedBookings() {
  const snapshot = await adminDb.collection('reservations').where('status', 'in', ['pending', 'confirmed']).get();
  const dayAgo = Date.now() - 24 * 3600000;
  const result = { noShows: 0, expiredHolds: 0, failed: 0 };
  for (const document of snapshot.docs) {
    const r = document.data();
    const holdExpires = getHoldExpiresMs(r);
    const expiredHold = holdExpires !== null && holdExpires < dayAgo;
    const noShow = !expiredHold && canMarkNoShow(r);
    if (!expiredHold && !noShow) continue;
    try {
      const outcome = await cancelBooking({
        actor: SYSTEM,
        reservationId: document.id,
        noShow,
        reason: expiredHold ? 'Not paid in time: the room hold expired.' : '',
        // Unpaid holds never paid anything, so no email for those.
        sendEmail: !expiredHold,
      });
      await logActivity(SYSTEM, {
        action: noShow ? 'reservation_no_show' : 'reservation_cancelled',
        summary: noShow
          ? `Marked booking ${ref(document.id)} as a no-show (fee ${peso(outcome.fee)})`
          : `Cancelled unpaid booking ${ref(document.id)}: not paid in time`,
        reservationId: document.id,
        guestName: r.guestName || '',
      });
      if (noShow) result.noShows += 1; else result.expiredHolds += 1;
    } catch (error) {
      console.error('Closing a missed booking failed:', document.id, error);
      result.failed += 1;
    }
  }
  return result;
}

// Firestore values (Timestamps, etc.) as plain JSON.
const toPlain = value => {
  if (value === null || value === undefined) return null;
  if (typeof value.toDate === 'function') return value.toDate().toISOString();
  if (Array.isArray(value)) return value.map(toPlain);
  if (typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, toPlain(item)]));
  return value;
};

async function emailBackup() {
  const data = {};
  const counts = {};
  for (const name of BACKUP_COLLECTIONS) {
    const snapshot = await adminDb.collection(name).get();
    data[name] = snapshot.docs.map(doc => ({ id: doc.id, ...toPlain(doc.data()) }));
    counts[name] = snapshot.size;
  }
  const dateLabel = manilaKey(0);
  const content = zlib.gzipSync(Buffer.from(JSON.stringify({ exportedAt: new Date().toISOString(), data })));
  await sendBackupEmail({ filename: `lawiswis-backup-${dateLabel}.json.gz`, content, counts, dateLabel });
  return { sizeKb: Math.round(content.length / 1024), counts };
}

export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error('daily jobs: CRON_SECRET is not set in Vercel, so nothing runs.');
    return res.status(500).json({ error: 'Daily jobs are not configured.' });
  }
  if (req.headers.authorization !== `Bearer ${secret}`) {
    return res.status(401).json({ error: 'Not authorized.' });
  }
  if (!adminDb) return res.status(500).json({ error: 'Service is not configured.' });

  const manilaHour = new Date(Date.now() + MANILA_OFFSET_MS).getUTCHours();
  const morning = manilaHour < 12;
  const report = {};
  // Each job runs on its own, so one failing doesn't stop the others.
  const jobs = [['reminders', sendReminders]];
  if (morning) jobs.push(['missedBookings', closeMissedBookings], ['backup', emailBackup]);
  for (const [name, job] of jobs) {
    try {
      report[name] = await job();
    } catch (error) {
      console.error(`daily job "${name}" failed:`, error);
      report[name] = { error: 'failed' };
    }
  }
  return res.status(200).json(report);
}
