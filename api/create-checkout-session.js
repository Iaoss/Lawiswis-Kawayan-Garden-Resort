// api/create-checkout-session.js
//
// Vercel serverless function. Runs server-side only — this is the one
// place your PayMongo SECRET key is allowed to exist. Never put it in
// any file under /src, never prefix it with VITE_.

import { adminDb } from '../src/lib/firebaseAdmin';
import { getOnlinePaymentAmount } from '../src/lib/paymentPolicy';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { reservationId, guestName, guestEmail, description, amount, paymentType, paymentChoice } = req.body || {};

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

  let checkoutAmount;
  try {
    const reservationRef = adminDb.collection('reservations').doc(reservationId);
    const reservationSnap = await reservationRef.get();
    if (!reservationSnap.exists) {
      return res.status(404).json({ error: 'Reservation not found' });
    }

    const reservation = reservationSnap.data();
    const balance = Number(reservation.totalAmount || 0) + Number(reservation.extraCharges || 0) - Number(reservation.amountPaid || 0);
    if (balance <= 0) {
      return res.status(400).json({ error: 'This reservation has no outstanding balance' });
    }

    if (checkoutType === 'booking') {
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
      checkoutAmount = Number(amount);
      if (!Number.isFinite(checkoutAmount) || checkoutAmount <= 0 || checkoutAmount - balance > 0.001) {
        return res.status(400).json({ error: 'Enter a positive amount no greater than the outstanding balance' });
      }
    }
  } catch (err) {
    console.error('Could not validate reservation payment:', err);
    return res.status(500).json({ error: 'Could not validate reservation payment' });
  }

  const secretKey = process.env.PAYMONGO_SECRET_KEY;
  if (!secretKey) {
    return res.status(500).json({ error: 'PayMongo secret key is not configured' });
  }

  const amountInCentavos = Math.round(checkoutAmount * 100);
  const siteUrl = process.env.PUBLIC_SITE_URL || `https://${req.headers.host}`;

  try {
    const response = await fetch('https://api.paymongo.com/v1/checkout_sessions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Basic ' + Buffer.from(`${secretKey}:`).toString('base64'),
      },
      body: JSON.stringify({
        data: {
          attributes: {
            billing: (guestEmail || guestName) ? {
              name: guestName || undefined,
              email: guestEmail || undefined,
            } : undefined,
            send_email_receipt: false,
            show_description: true,
            show_line_items: true,
            description: description || `Reservation ${reservationId}`,
            line_items: [{
              currency: 'PHP',
              amount: amountInCentavos,
              name: description || 'Reservation payment',
              quantity: 1,
            }],
            payment_method_types: ['card', 'gcash', 'paymaya', 'grab_pay'],
            success_url: `${siteUrl}/payment/success?reservationId=${reservationId}`,
            cancel_url: `${siteUrl}/payment/cancelled?reservationId=${reservationId}`,
            metadata: { reservationId, paymentType: checkoutType },
          },
        },
      }),
    });

    const responseText = await response.text();
    let json;
    try {
      json = responseText ? JSON.parse(responseText) : {};
    } catch {
      console.error('PayMongo returned invalid JSON:', responseText);
      return res.status(502).json({ error: 'PayMongo returned an invalid response' });
    }

    if (!response.ok) {
      console.error('PayMongo error:', json);
      return res.status(response.status).json({
        error: json.errors?.[0]?.detail || 'PayMongo request failed',
      });
    }

    const session = json.data;
    if (!session?.attributes?.checkout_url) {
      return res.status(502).json({ error: 'PayMongo did not return a checkout URL' });
    }

    return res.status(200).json({
      checkoutUrl: session.attributes.checkout_url,
      checkoutSessionId: session.id,
    });
  } catch (err) {
    console.error('create-checkout-session failed:', err);
    return res.status(500).json({ error: 'Failed to create checkout session' });
  }
}