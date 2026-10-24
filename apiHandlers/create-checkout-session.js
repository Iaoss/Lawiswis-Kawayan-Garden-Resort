// api/create-checkout-session.js
//
// Vercel serverless function. Runs server-side only — this is the one
// place your PayMongo SECRET key is allowed to exist. Never put it in
// any file under /src, never prefix it with VITE_.

import { adminDb } from '../lib/firebaseAdmin';
import { getOnlinePaymentAmount } from '../src/lib/paymentPolicy';
import { createPayMongoCheckoutSession } from '../lib/paymongoCheckout';
import { verifyStaff } from '../lib/verifyStaff';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Only the reservation id, payment choice and (for staff billing) an amount
  // come from the browser. Names, descriptions and booking amounts are read
  // from the stored reservation so they can't be altered in the page.
  const {
    reservationId,
    amount,
    paymentType,
    paymentChoice,
    modificationRequestId,
  } = req.body || {};

  if (!reservationId) {
    return res.status(400).json({ error: 'reservationId is required' });
  }

  const checkoutType = paymentType || 'billing';
  if (!['booking', 'billing'].includes(checkoutType)) {
    return res.status(400).json({ error: 'Invalid payment type' });
  }

  if (!adminDb) {
    return res.status(500).json({ error: 'Firebase Admin is not configured' });
  }

  // Balance-payment links ("billing") take an amount typed by staff, so only
  // signed-in staff may create them. Guest checkouts ("booking") never take
  // an amount from the browser: it comes from the saved reservation.
  if (checkoutType === 'billing' && !(await verifyStaff(req))) {
    return res.status(401).json({ error: 'Only resort staff can create balance payment links.' });
  }

  let checkoutAmount;
  let guestName;
  let guestEmail;
  let description;
  try {
    const reservationRef = adminDb.collection('reservations').doc(reservationId);
    const reservationSnap = await reservationRef.get();
    if (!reservationSnap.exists) {
      return res.status(404).json({ error: 'Reservation not found' });
    }

    const reservation = reservationSnap.data();
    if (['cancelled', 'checked-out'].includes(String(reservation.status || '').toLowerCase())) {
      return res.status(409).json({ error: 'This reservation can no longer be paid online.' });
    }
    guestName = reservation.guestName || 'Guest';
    guestEmail = reservation.email || '';
    const units = Number(reservation.nights) || 1;
    const unitLabel = reservation.bookingType === 'daytour' ? 'day' : 'night';
    description = reservation.type === 'corporate'
      ? `${reservation.packageName || 'Corporate'} corporate group booking · ${Number(reservation.totalGuests) || 0} guests`
      : checkoutType === 'billing'
        ? `Room ${reservation.roomNumber || ''} — ${guestName}`
        : `Room ${reservation.roomNumber || ''} (${reservation.roomType || ''}) — ${units} ${unitLabel}${units === 1 ? '' : 's'}`;
    const balance = Number(reservation.totalAmount || 0) + Number(reservation.extraCharges || 0) - Number(reservation.amountPaid || 0);

    if (checkoutType === 'booking') {
      if (balance <= 0) {
        return res.status(400).json({ error: 'This reservation has no outstanding balance' });
      }
      if (reservation.paymentMethod !== 'online') {
        return res.status(400).json({ error: 'This reservation was not set up for online payment' });
      }
      if (!['full', 'deposit'].includes(paymentChoice)) {
        return res.status(400).json({ error: 'Choose full payment or the required deposit' });
      }
      if (Number(reservation.amountPaid || 0) > 0) {
        return res.status(409).json({ error: 'A payment has already been recorded for this reservation' });
      }
      checkoutAmount = getOnlinePaymentAmount(Number(reservation.totalAmount || 0), paymentChoice);
    } else {
      if (modificationRequestId) {
        const modification = reservation.modificationRequest;
        if (modification?.id !== modificationRequestId
          || modification?.status !== 'awaiting_payment'
          || Number(modification.paymentDue || 0) <= 0) {
          return res.status(409).json({ error: 'This schedule-change payment is no longer valid.' });
        }
        checkoutAmount = Number(modification.paymentDue);
      } else {
        if (balance <= 0) {
          return res.status(400).json({ error: 'This reservation has no outstanding balance' });
        }
        checkoutAmount = Number(amount);
        if (!Number.isFinite(checkoutAmount) || checkoutAmount <= 0 || checkoutAmount - balance > 0.001) {
          return res.status(400).json({ error: 'Enter a positive amount no greater than the outstanding balance' });
        }
      }
    }
  } catch (err) {
    console.error('Could not validate reservation payment:', err);
    return res.status(500).json({ error: 'Could not validate reservation payment' });
  }

  const siteUrl = process.env.PUBLIC_SITE_URL || `https://${req.headers.host}`;

  try {
    const session = await createPayMongoCheckoutSession({
      reservationId,
      amount: checkoutAmount,
      guestName,
      guestEmail,
      description,
      paymentType: checkoutType,
      paymentChoice,
      modificationRequestId,
      siteUrl,
    });
    // Keep a record of what was asked for, so it can be matched to PayMongo later.
    try {
      await adminDb.collection('reservations').doc(reservationId).update({
        lastCheckoutSession: {
          id: session.checkoutSessionId,
          amount: checkoutAmount,
          type: checkoutType,
          createdAt: new Date().toISOString(),
        },
      });
    } catch (recordError) {
      console.warn('Could not save checkout session reference:', recordError.message);
    }
    return res.status(200).json({
      amount: checkoutAmount,
      checkoutUrl: session.checkoutUrl,
      checkoutSessionId: session.checkoutSessionId,
    });
  } catch (err) {
    console.error('create-checkout-session failed:', err);
    return res.status(502).json({ error: err.message || 'Failed to create checkout session' });
  }
}