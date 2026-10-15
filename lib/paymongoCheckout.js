export async function createPayMongoCheckoutSession({
  reservationId,
  amount,
  description,
  guestName,
  guestEmail,
  paymentType = 'billing',
  paymentChoice,
  modificationRequestId,
  siteUrl,
}) {
  const secretKey = process.env.PAYMONGO_SECRET_KEY;
  if (!secretKey) throw new Error('PayMongo secret key is not configured.');
  const amountInCentavos = Math.round(Number(amount) * 100);
  if (!Number.isSafeInteger(amountInCentavos) || amountInCentavos < 100) {
    throw new Error('Checkout amount must be at least ₱1.00.');
  }

  const baseUrl = siteUrl || process.env.PUBLIC_SITE_URL;
  if (!baseUrl) throw new Error('The public site URL is not configured.');
  const response = await fetch('https://api.paymongo.com/v1/checkout_sessions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Basic ${Buffer.from(`${secretKey}:`).toString('base64')}`,
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
          success_url: `${baseUrl}/payment/success?reservationId=${reservationId}`,
          cancel_url: `${baseUrl}/payment/cancelled?reservationId=${reservationId}`,
          metadata: {
            reservationId,
            paymentType,
            ...(paymentChoice ? { paymentChoice } : {}),
            ...(modificationRequestId ? { modificationRequestId } : {}),
          },
        },
      },
    }),
  });

  const responseText = await response.text();
  let json;
  try {
    json = responseText ? JSON.parse(responseText) : {};
  } catch {
    throw new Error('PayMongo returned an invalid response.');
  }
  if (!response.ok) {
    throw new Error(json.errors?.[0]?.detail || 'PayMongo request failed.');
  }
  const session = json.data;
  if (!session?.attributes?.checkout_url) throw new Error('PayMongo did not return a checkout URL.');
  return { checkoutUrl: session.attributes.checkout_url, checkoutSessionId: session.id };
}
