import { adminDb, FieldValue } from '../lib/firebaseAdmin';

const EMAIL_RE = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;

function publicReservation(snapshot) {
  const reservation = snapshot.data();
  return {
    bookingId: snapshot.id,
    roomName: `Room ${reservation.roomNumber || ''}${reservation.roomType ? ` (${reservation.roomType})` : ''}`.trim(),
    checkIn: reservation.checkIn || '',
    checkOut: reservation.checkOut || '',
    totalAmount: Number(reservation.totalAmount || 0),
    status: reservation.status || 'pending',
    refundRequestStatus: reservation.refundRequestStatus || '',
  };
}

async function findReservation(reference, contact) {
  const normalizedReference = reference.replace(/^#/, '').toUpperCase();
  const normalizedPhone = contact.replace(/\D/g, '');
  const normalizedEmail = contact.toLowerCase();
  const contactIsEmail = EMAIL_RE.test(normalizedEmail);
  if (!contactIsEmail && !/^09\d{9}$/.test(normalizedPhone)) {
    throw new Error('Enter the email or 11-digit phone number used for the booking.');
  }

  const field = contactIsEmail ? 'emailLower' : 'phone';
  const value = contactIsEmail ? normalizedEmail : normalizedPhone;
  const snapshot = await adminDb.collection('reservations').where(field, '==', value).get();
  const reservation = snapshot.docs.find(document => document.id.toUpperCase().startsWith(normalizedReference));
  if (!reservation) return null;
  return reservation;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!adminDb) return res.status(503).json({ error: 'Reservation lookup is temporarily unavailable.' });

  const { action, reference, contact } = req.body || {};
  const normalizedReference = typeof reference === 'string' ? reference.trim() : '';
  const normalizedContact = typeof contact === 'string' ? contact.trim() : '';
  if (!/^(?:#)?[A-Za-z0-9-]{8,32}$/.test(normalizedReference) || !normalizedContact || normalizedContact.length > 254) {
    return res.status(400).json({ error: 'Provide a valid booking reference and the booking phone number or email.' });
  }

  try {
    const reservation = await findReservation(normalizedReference, normalizedContact);
    if (!reservation) return res.status(404).json({ error: 'No reservation matched that reference and contact detail.' });

    if (action === 'lookup') {
      return res.status(200).json({ reservation: publicReservation(reservation) });
    }

    if (action !== 'refund') {
      return res.status(400).json({ error: 'Choose a valid reservation action.' });
    }

    const reservationRef = reservation.ref;
    const result = await adminDb.runTransaction(async transaction => {
      const current = await transaction.get(reservationRef);
      if (!current.exists) return { error: 'Reservation not found.' };
      const data = current.data();
      if (!['pending', 'confirmed'].includes(String(data.status || '').toLowerCase())) {
        return { error: 'A refund request cannot be submitted for this reservation status.' };
      }
      if (data.refundRequestStatus === 'requested') return { alreadyRequested: true };
      transaction.update(reservationRef, {
        refundRequestStatus: 'requested',
        refundRequestedAt: FieldValue.serverTimestamp(),
        refundRequestContactType: EMAIL_RE.test(normalizedContact.toLowerCase()) ? 'email' : 'phone',
      });
      return { alreadyRequested: false };
    });

    if (result.error) return res.status(409).json({ error: result.error });
    return res.status(200).json({ requested: true, alreadyRequested: result.alreadyRequested });
  } catch (error) {
    if (error.message === 'Enter the email or 11-digit phone number used for the booking.') {
      return res.status(400).json({ error: error.message });
    }
    console.error('Guest reservation action failed:', error);
    return res.status(500).json({ error: 'Could not process the reservation request.' });
  }
}
