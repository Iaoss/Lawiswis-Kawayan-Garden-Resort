import contactInquiry from '../apiHandlers/contact-inquiry';
import newsletterSubscribe from '../apiHandlers/newsletter-subscribe';
import newsletterBroadcast from '../apiHandlers/newsletter-broadcast';
import resortAvailability from '../apiHandlers/resort-availability';
import occupancy from '../apiHandlers/occupancy';

const handlers = {
  'contact-inquiry': contactInquiry,
  'newsletter-subscribe': newsletterSubscribe,
  'newsletter-broadcast': newsletterBroadcast,
  'resort-availability': resortAvailability,
  occupancy,
};

export default function handler(req, res) {
  const route = req.query?.route;
  const endpoint = Array.isArray(route) ? route.join('/') : route;
  const endpointHandler = handlers[endpoint];

  if (!endpointHandler) {
    return res.status(404).json({ error: 'API endpoint not found.' });
  }

  return endpointHandler(req, res);
}
