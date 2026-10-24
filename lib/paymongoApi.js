// Server-side reads from the PayMongo API, using the secret key.
// Used to double-check webhook events before recording a payment: the
// webhook says "paid", and we confirm it with PayMongo directly.

async function paymongoGet(path) {
  const secretKey = process.env.PAYMONGO_SECRET_KEY;
  if (!secretKey) throw new Error('PayMongo secret key is not configured.');
  const response = await fetch(`https://api.paymongo.com/v1/${path}`, {
    headers: { Authorization: `Basic ${Buffer.from(`${secretKey}:`).toString('base64')}` },
  });
  const text = await response.text();
  let json = {};
  try { json = text ? JSON.parse(text) : {}; } catch { throw new Error('PayMongo returned an invalid response.'); }
  if (!response.ok) {
    const error = new Error(json.errors?.[0]?.detail || `PayMongo request failed (${response.status}).`);
    error.status = response.status;
    throw error;
  }
  return json.data;
}

// Confirms with PayMongo that a payment really succeeded, and returns the
// amount PayMongo actually collected. Returns null when PayMongo says it
// wasn't paid (or doesn't belong to this reservation). Throws if PayMongo
// can't be reached, so the webhook is retried later.
export async function verifyPaidWithPayMongo({ checkoutSessionId, paymentId, reservationId }) {
  if (checkoutSessionId) {
    const session = await paymongoGet(`checkout_sessions/${encodeURIComponent(checkoutSessionId)}`);
    const attributes = session?.attributes || {};
    if (attributes.metadata?.reservationId !== reservationId) return null;
    const payments = attributes.payments || [];
    const payment = paymentId
      ? payments.find(item => item.id === paymentId)
      : payments.find(item => item.attributes?.status === 'paid');
    if (!payment || payment.attributes?.status !== 'paid') return null;
    return {
      paymentId: payment.id,
      amountPaid: Number(payment.attributes.amount || 0) / 100,
      paymentMethod: payment.attributes.source?.type || 'unknown',
      metadata: attributes.metadata || {},
    };
  }
  if (paymentId) {
    const payment = await paymongoGet(`payments/${encodeURIComponent(paymentId)}`);
    const attributes = payment?.attributes || {};
    if (attributes.status !== 'paid') return null;
    if (attributes.metadata?.reservationId && attributes.metadata.reservationId !== reservationId) return null;
    return {
      paymentId: payment.id,
      amountPaid: Number(attributes.amount || 0) / 100,
      paymentMethod: attributes.source?.type || 'unknown',
      metadata: attributes.metadata || {},
    };
  }
  return null;
}
