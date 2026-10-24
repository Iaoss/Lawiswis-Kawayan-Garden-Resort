// Single serverless function for the whole backend (Vercel Hobby: max 12 functions).
// Every handler lives in /apiHandlers and is registered below by its URL name,
// so /api/<name> keeps working exactly as before.
import checkoutSessionStatus from '../apiHandlers/checkout-session-status';
import createCheckoutSession from '../apiHandlers/create-checkout-session';
import createReservation from '../apiHandlers/create-reservation';
import emailSend from '../apiHandlers/email-send';
import emailSync from '../apiHandlers/email-sync';
import paymongoWebhook from '../apiHandlers/paymongo-webhook';
import roomAvailability from '../apiHandlers/room-availability';
import sendConfirmationEmail from '../apiHandlers/send-confirmation-email';
import sendPaymentReceipt from '../apiHandlers/send-payment-receipt';
import sendReservationConfirmation from '../apiHandlers/send-reservation-confirmation';
import validatePromoCode from '../apiHandlers/validate-promo-code';
import contactInquiry from '../apiHandlers/contact-inquiry';
import newsletterSubscribe from '../apiHandlers/newsletter-subscribe';
import newsletterBroadcast from '../apiHandlers/newsletter-broadcast';
import resortAvailability from '../apiHandlers/resort-availability';
import occupancy from '../apiHandlers/occupancy';
import reservationGuestAction from '../apiHandlers/reservation-guest-action';
import publicFeedback from '../apiHandlers/public-feedback';
import createCorporateReservation from '../apiHandlers/create-corporate-reservation';
import reservationStaffAction from '../apiHandlers/reservation-staff-action';
import submitFeedback from '../apiHandlers/submit-feedback';
import arrivalReminders from '../apiHandlers/arrival-reminders';
import sendThankYou from '../apiHandlers/send-thank-you';
import reservationStatus from '../apiHandlers/reservation-status';

// The body parser is disabled for the whole function because the PayMongo
// webhook needs the raw body for signature checks. Other routes get req.body
// parsed below.
export const config = { api: { bodyParser: false } };

const RAW_BODY_ROUTES = new Set(['paymongo-webhook']);

const handlers = {
  'checkout-session-status': checkoutSessionStatus,
  'create-checkout-session': createCheckoutSession,
  'create-reservation': createReservation,
  'email-send': emailSend,
  'email-sync': emailSync,
  'paymongo-webhook': paymongoWebhook,
  'room-availability': roomAvailability,
  'send-confirmation-email': sendConfirmationEmail,
  'send-payment-receipt': sendPaymentReceipt,
  'send-reservation-confirmation': sendReservationConfirmation,
  'validate-promo-code': validatePromoCode,
  'contact-inquiry': contactInquiry,
  'newsletter-subscribe': newsletterSubscribe,
  'newsletter-broadcast': newsletterBroadcast,
  'resort-availability': resortAvailability,
  'reservation-guest-action': reservationGuestAction,
  'reservation-staff-action': reservationStaffAction,
  'reservation-status': reservationStatus,
  'create-corporate-reservation': createCorporateReservation,
  'public-feedback': publicFeedback,
  'submit-feedback': submitFeedback,
  'arrival-reminders': arrivalReminders,
  'send-thank-you': sendThankYou,
  occupancy,
};

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => { data += chunk; });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

async function parseBody(req) {
  if (req.body !== undefined || ['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return;
  const raw = await readBody(req);
  const type = String(req.headers['content-type'] || '');
  if (!raw) { req.body = {}; return; }
  if (type.includes('application/json')) {
    try { req.body = JSON.parse(raw); } catch { req.body = {}; }
  } else if (type.includes('application/x-www-form-urlencoded')) {
    req.body = Object.fromEntries(new URLSearchParams(raw));
  } else {
    req.body = raw;
  }
}

export default async function handler(req, res) {
  const route = req.query?.route;
  const routePath = Array.isArray(route) ? route.join('/') : route;
  const requestPath = req.url
    ? new URL(req.url, `https://${req.headers.host || 'localhost'}`).pathname
    : '';
  const endpoint = (routePath || requestPath.replace(/^\/api\//, ''))
    .split('/')
    .filter(Boolean)
    .pop();
  const endpointHandler = handlers[endpoint];

  if (!endpointHandler) {
    return res.status(404).json({ error: 'API endpoint not found.' });
  }

  try {
    if (!RAW_BODY_ROUTES.has(endpoint)) await parseBody(req);
    return await endpointHandler(req, res);
  } catch (error) {
    console.error(`API ${endpoint} failed:`, error);
    if (!res.headersSent) return res.status(500).json({ error: 'Internal server error.' });
    return undefined;
  }
}
