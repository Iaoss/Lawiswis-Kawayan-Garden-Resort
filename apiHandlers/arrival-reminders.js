// Daily cron (see vercel.json): emails guests whose check-in is tomorrow.
import { adminDb, FieldValue } from '../lib/firebaseAdmin';
import { sendArrivalReminderEmail } from '../lib/email';

const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000;

function tomorrowKey() {
  const manilaNow = new Date(Date.now() + MANILA_OFFSET_MS);
  manilaNow.setUTCDate(manilaNow.getUTCDate() + 1);
  return manilaNow.toISOString().slice(0, 10);
}

export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.authorization !== `Bearer ${secret}`) {
    return res.status(401).json({ error: 'Not authorized.' });
  }
  if (!adminDb) return res.status(500).json({ error: 'Service is not configured.' });

  const target = tomorrowKey();
  let sent = 0;
  let failed = 0;
  try {
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
    return res.status(200).json({ date: target, sent, failed });
  } catch (error) {
    console.error('arrival-reminders error:', error);
    return res.status(500).json({ error: 'Could not send reminders.' });
  }
}
