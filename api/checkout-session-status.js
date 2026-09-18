// api/checkout-session-status.js
//
// Vercel serverless function. Runs server-side only — uses the same
// PAYMONGO_SECRET_KEY as create-checkout-session.js. Never put this key
// in any file under /src, never prefix it with VITE_.
//
// Looks up a checkout session directly from PayMongo and reports whether
// it's actually been paid. This exists so payment confirmation doesn't
// depend on the webhook firing — front desk can check on demand.

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { checkoutSessionId } = req.query || {};

  if (!checkoutSessionId) {
    return res.status(400).json({ error: 'checkoutSessionId is required' });
  }

  const secretKey = process.env.PAYMONGO_SECRET_KEY;
  if (!secretKey) {
    return res.status(500).json({ error: 'PayMongo secret key is not configured' });
  }

  try {
    const response = await fetch(`https://api.paymongo.com/v1/checkout_sessions/${checkoutSessionId}`, {
      method: 'GET',
      headers: {
        Authorization: 'Basic ' + Buffer.from(`${secretKey}:`).toString('base64'),
      },
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

    const attrs = json.data?.attributes || {};
    const paymentIntentStatus = attrs.payment_intent?.attributes?.status;
    const payments = attrs.payments || [];
    const paidPayment = payments.find(p => p.attributes?.status === 'paid');

    let status = 'unpaid';
    let amountPaid = null;

    if (paymentIntentStatus === 'succeeded' || paidPayment) {
      status = 'paid';
      const centavos = paidPayment?.attributes?.amount ?? attrs.payment_intent?.attributes?.amount;
      amountPaid = typeof centavos === 'number' ? centavos / 100 : null;
    } else if (attrs.expires_at && attrs.expires_at * 1000 < Date.now()) {
      status = 'expired';
    }

    return res.status(200).json({ status, amountPaid });
  } catch (err) {
    console.error('checkout-session-status failed:', err);
    return res.status(500).json({ error: 'Failed to check checkout session status' });
  }
}
