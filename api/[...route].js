import contactInquiry from '../apiHandlers/contact-inquiry';
import newsletterSubscribe from '../apiHandlers/newsletter-subscribe';
import newsletterBroadcast from '../apiHandlers/newsletter-broadcast';
import resortAvailability from '../apiHandlers/resort-availability';
import occupancy from '../apiHandlers/occupancy';
import reservationGuestAction from '../apiHandlers/reservation-guest-action';

const handlers = {
  'contact-inquiry': contactInquiry,
  'newsletter-subscribe': newsletterSubscribe,
  'newsletter-broadcast': newsletterBroadcast,
  'resort-availability': resortAvailability,
  'reservation-guest-action': reservationGuestAction,
  occupancy,
};

export default function handler(req, res) {
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

  return endpointHandler(req, res);
}
