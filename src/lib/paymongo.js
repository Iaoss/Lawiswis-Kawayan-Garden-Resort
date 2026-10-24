import { auth } from '../firebase/firebase';

// The server reads the guest, description and booking amount from the stored
// reservation. `amount` is only used for staff balance payments, and the
// server caps it at the outstanding balance.
export async function createPayMongoCheckout({ reservationId, amount, paymentType, paymentChoice }) {
  // Staff balance links must prove a staff login; guest checkouts don't need one.
  const headers = { 'Content-Type': 'application/json' };
  if (paymentType !== 'booking' && auth.currentUser) {
    headers.Authorization = `Bearer ${await auth.currentUser.getIdToken()}`;
  }
  const res = await fetch('/api/create-checkout-session', {
    method: 'POST',
    headers,
    body: JSON.stringify({ reservationId, amount, paymentType, paymentChoice }),
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