export async function createPayMongoCheckout({ reservationId, guestName, guestEmail, description, amount }) {
  const res = await fetch('/api/create-checkout-session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reservationId, guestName, guestEmail, description, amount }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to start payment');
  return data; // { checkoutUrl, checkoutSessionId }
}