import { adminDb, FieldValue } from '../lib/firebaseAdmin';
import { verifyStaff } from '../lib/verifyStaff';
import { logActivity } from '../lib/activityLog';
import { formatClosedRange, getClosedDatesError, normalizeClosedDates, upcomingClosedDates } from '../src/lib/closedDates';
import { manilaDateKey } from '../src/lib/reservationStatus';
import { isAffectedByClosure } from '../src/lib/closureReschedule';
import { sendClosureNoticeEmail } from '../lib/email';

// Resort status shown on the website:
//   open    - bookings work as usual
//   limited - bookings still work, with a notice (e.g. pool under repair)
//   closed  - bookings are turned off

const SETTINGS_DOC = 'siteSettings/resortAvailability';

// New closed dates: email every guest booked on them their options
// (move to new dates or a full refund, no fee). Linked rooms get one email.
// Guests already told about the same dates are skipped.
async function notifyAffectedGuests(periods, staff) {
  const result = { notified: 0, noEmail: 0, failed: 0 };
  if (!periods.length) return result;
  const snapshot = await adminDb.collection('reservations').where('status', 'in', ['pending', 'confirmed']).get();
  const emailedGroups = new Set();
  for (const period of periods) {
    for (const doc of snapshot.docs) {
      const reservation = doc.data();
      if (reservation.type === 'corporate-room' || !isAffectedByClosure(reservation, period.from, period.to)) continue;
      const notice = reservation.closureNotice || {};
      if (notice.closedFrom === period.from && notice.closedTo === period.to) continue;
      const closureNotice = { sentAt: FieldValue.serverTimestamp(), closedFrom: period.from, closedTo: period.to, reason: period.reason, sentBy: staff.name || staff.email || '', automatic: true };
      const email = reservation.email || reservation.guestEmail;
      if (!email) { result.noEmail += 1; await doc.ref.update({ closureNotice }); continue; }
      const groupKey = reservation.groupId ? `${reservation.groupId}|${period.from}` : '';
      try {
        if (!groupKey || !emailedGroups.has(groupKey)) {
          await sendClosureNoticeEmail({ reservation, bookingRef: doc.id.slice(0, 8).toUpperCase(), reason: period.reason, closedFrom: period.from, closedTo: period.to });
          if (groupKey) emailedGroups.add(groupKey);
          result.notified += 1;
        }
        await doc.ref.update({ closureNotice });
      } catch (error) {
        console.error('Closure notice failed:', doc.id, error);
        result.failed += 1;
      }
    }
  }
  return result;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'GET') {
    if (!adminDb) return res.status(503).json({ error: 'Availability status is unavailable.' });
    try {
      const snapshot = await adminDb.doc(SETTINGS_DOC).get();
      const data = snapshot.exists ? snapshot.data() : {};
      const available = data.available !== false;
      return res.status(200).json({
        available,
        limited: available && data.limited === true,
        reason: String(data.reason || ''),
        closedDates: upcomingClosedDates(data.closedDates, manilaDateKey()),
      });
    } catch (error) {
      console.error('Resort availability read failed:', error);
      return res.status(500).json({ error: 'Could not load resort availability.' });
    }
  }
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['GET', 'POST']);
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const staff = await verifyStaff(req);
  if (!staff) return res.status(401).json({ error: 'Not authorized.' });
  if (staff.role !== 'admin') return res.status(403).json({ error: 'Only an admin can change the resort status.' });
  if (!adminDb) return res.status(503).json({ error: 'Availability settings are unavailable.' });

  // Planned closed dates only (Settings → "Closed dates").
  if (Array.isArray(req.body?.closedDates) && req.body.available === undefined) {
    const listError = getClosedDatesError(req.body.closedDates);
    if (listError) return res.status(400).json({ error: listError });
    const closedDates = normalizeClosedDates(req.body.closedDates);
    try {
      const before = await adminDb.doc(SETTINGS_DOC).get();
      const known = new Set(normalizeClosedDates(before.exists ? before.data().closedDates : []).map(item => `${item.from}|${item.to}`));
      const added = upcomingClosedDates(closedDates, manilaDateKey()).filter(item => !known.has(`${item.from}|${item.to}`));
      await adminDb.doc(SETTINGS_DOC).set({ closedDates, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      let notices = { notified: 0, noEmail: 0, failed: 0 };
      try {
        notices = await notifyAffectedGuests(added, staff);
      } catch (noticeError) {
        console.error('Closure notices failed:', noticeError);
        notices.failed = -1;
      }
      await logActivity(staff, {
        action: 'resort_status_changed',
        summary: closedDates.length
          ? `Set closed dates: ${closedDates.map(item => `${formatClosedRange(item)}${item.reason ? ` (${item.reason})` : ''}`).join('; ')}`.slice(0, 300)
          : 'Removed all planned closed dates',
      });
      if (notices.notified || notices.noEmail) {
        await logActivity(staff, {
          action: 'closure_notice_sent',
          summary: `Closed dates: emailed ${notices.notified} affected guest(s)${notices.noEmail ? `; ${notices.noEmail} booking(s) have no email` : ''}`,
        });
      }
      return res.status(200).json({ closedDates: upcomingClosedDates(closedDates, manilaDateKey()), notices });
    } catch (error) {
      console.error('Closed dates save failed:', error);
      return res.status(500).json({ error: 'Could not save the closed dates.' });
    }
  }

  const { available, limited = false, reason = '' } = req.body || {};
  if (typeof available !== 'boolean' || typeof limited !== 'boolean' || typeof reason !== 'string' || reason.length > 300) {
    return res.status(400).json({ error: 'Provide an availability status and a reason under 300 characters.' });
  }
  const isLimited = available && limited;
  if (isLimited && !reason.trim()) {
    return res.status(400).json({ error: 'Add a message for guests explaining what is limited.' });
  }
  try {
    await adminDb.doc(SETTINGS_DOC).set({
      available,
      limited: isLimited,
      reason: reason.trim(),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    const label = !available ? 'Closed' : isLimited ? 'Limited' : 'Open';
    await logActivity(staff, { action: 'resort_status_changed', summary: `Set the resort status to ${label}${reason.trim() ? ` (${reason.trim().slice(0, 120)})` : ''}` });
    return res.status(200).json({ available, limited: isLimited, reason: reason.trim() });
  } catch (error) {
    console.error('Resort availability save failed:', error);
    return res.status(500).json({ error: 'Could not save resort availability.' });
  }
}
