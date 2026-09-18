export async function createPayMongoCheckout({ reservationId, guestName, guestEmail, description, amount }) {
  const res = await fetch('/api/create-checkout-session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reservationId, guestName, guestEmail, description, amount }),
  });
  const responseText = await res.text();
  let data;
  try {
    data = responseText ? JSON.parse(responseText) : {};
  } catch {
    throw new Error(`Payment service returned invalid data (${res.status})`);
  }
  if (!res.ok) throw new Error(data.error || 'Failed to start payment');
  return data; // { checkoutUrl, checkoutSessionId }
}

export async function checkPayMongoCheckoutStatus(checkoutSessionId) {
  const res = await fetch(`/api/checkout-session-status?checkoutSessionId=${checkoutSessionId}`);
  const responseText = await res.text();
  let data;
  try {
    data = responseText ? JSON.parse(responseText) : {};
  } catch {
    throw new Error(`Payment status check returned invalid data (${res.status})`);
  }
  if (!res.ok) throw new Error(data.error || 'Failed to check payment status');
  return data; // { status: 'paid' | 'unpaid' | 'expired', amountPaid }
}