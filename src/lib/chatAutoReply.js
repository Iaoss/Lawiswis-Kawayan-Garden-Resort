// Automatic answers in the guest chat. A guest taps a question (or types
// one, e.g. "magkano ang room?") and the server answers right away from the
// live rate card and room list, with no staff needed. Questions it doesn't
// understand stay in the chat for staff to answer.
import {
  COTTAGE_OPTIONS, DAYTOUR_TIME_SLOT, NIGHTTOUR_TIME_SLOT, OVERNIGHT_TIME_SLOTS,
  getRoomBaseRate, getRoomCapacityPolicy, getSwimmingRate,
} from './bookingPricing';
import { RESERVATION_DEPOSIT_PERCENTAGE } from './paymentPolicy';
import { DEFAULT_CANCELLATION_POLICY, describePolicyTiers, normalizeCancellationPolicy } from './cancellationPolicy';

const SITE = 'https://lawiswis-kawayan-garden-resort.vercel.app';
const peso = value => `₱${Number(value || 0).toLocaleString('en-PH')}`;

// The buttons guests can tap, in order.
export const AUTO_TOPICS = [
  { id: 'auto-room-rates', question: 'Room rates' },
  { id: 'auto-cottage-rates', question: 'Cottage rates' },
  { id: 'auto-tour-rates', question: 'Day & night tour rates' },
  { id: 'auto-times', question: 'Check-in & check-out times' },
  { id: 'auto-booking', question: 'How to book & pay' },
  { id: 'auto-cancellation', question: 'Cancellation & refunds' },
  { id: 'auto-location', question: 'Location & contact' },
];
export const isAutoTopic = id => AUTO_TOPICS.some(topic => topic.id === id);

// Words that point to each topic (English and Filipino), checked in order:
// the first match wins, so more specific topics come first.
const TOPIC_PATTERNS = [
  ['auto-cancellation', /\b(cancel+(ation|ed|ing)?|refund|ibalik|i-?cancel|ikansela)\b/],
  ['auto-cottage-rates', /\b(cottage|cottages|kubo|cabana|pavilion|umbrella|hut|kubol)\b/],
  ['auto-tour-rates', /\b(day ?tour|night ?tour|swimming|swim|languyan|entrance|pasok|entry|walk-?in fee|tour rate)\b/],
  ['auto-times', /\b(check ?-?in|check ?-?out|what time|anong oras|oras|open|bukas|close|sarado|hours)\b/],
  ['auto-room-rates', /\b(room|rooms|kwarto|kuwarto|suite|villa|overnight|magdamag|stay)\b.*\b(rate|rates|price|prices|presyo|magkano|how much|cost|halaga)\b|\b(rate|rates|price|prices|presyo|magkano|how much|cost|halaga)\b.*\b(room|rooms|kwarto|kuwarto|suite|villa|overnight|stay)\b|^\s*(rates?|prices?|magkano|presyo)\s*\??\s*$/],
  ['auto-booking', /\b(book|booking|reserve|reservation|pa-?reserve|mag-?book|pay|payment|bayad|gcash|maya|card|deposit|downpayment|dp)\b/],
  ['auto-location', /\b(where|saan|location|address|direction|directions|map|waze|contact|number|phone|call|email|tawag)\b/],
];

export function detectTopic(text) {
  const clean = String(text || '').toLowerCase().replace(/\s+/g, ' ').trim();
  if (!clean) return null;
  const match = TOPIC_PATTERNS.find(([, pattern]) => pattern.test(clean));
  return match ? match[0] : null;
}

// One line per kind of room: the lowest overnight and tour rate for it.
function roomRateLines(rooms = []) {
  const kinds = new Map();
  rooms.forEach(room => {
    if (!room || room.archived || room.hidden) return;
    let overnight;
    let daytour;
    try {
      overnight = getRoomBaseRate(room, 'overnight').amount;
      daytour = getRoomBaseRate(room, 'daytour').amount;
    } catch {
      return;
    }
    const policy = getRoomCapacityPolicy(room);
    const label = policy?.label && policy.label !== 'Selected room' ? policy.label : String(room.type || 'Room').replace(/([a-z])([A-Z])/g, '$1 $2');
    const current = kinds.get(label);
    const maxGuests = Number(policy?.maxGuests) || 0;
    if (!current) kinds.set(label, { label, overnight, daytour, maxGuests, count: 1 });
    else {
      current.overnight = Math.min(current.overnight, overnight);
      current.daytour = Math.min(current.daytour ?? daytour, daytour ?? current.daytour);
      current.maxGuests = Math.max(current.maxGuests, maxGuests);
      current.count += 1;
    }
  });
  return [...kinds.values()]
    .sort((a, b) => a.overnight - b.overnight)
    .map(kind => `• ${kind.label}${kind.maxGuests ? ` (up to ${kind.maxGuests})` : ''}: ${peso(kind.overnight)}/night${kind.daytour ? ` · ${peso(kind.daytour)} day or night tour` : ''}`);
}

// The answer text for a topic. `rooms` is the live room list (for rates).
export function buildAutoAnswer(topicId, { rooms = [], policy = DEFAULT_CANCELLATION_POLICY } = {}) {
  const day = getSwimmingRate('day');
  const night = getSwimmingRate('night');
  switch (topicId) {
    case 'auto-room-rates': {
      const lines = roomRateLines(rooms);
      if (!lines.length) return `Our room rates are on ${SITE}/rooms. A staff member can also help you here.`;
      return [
        'Here are our room rates (VAT included):',
        ...lines,
        'All overnight room rates include entrance fees, pool access, overnight accommodation and plated breakfast. An extra person is ₱800 per night, with breakfast.',
        'Pick your dates at ' + `${SITE}/book` + ' to see the exact price for your group.',
      ].join('\n');
    }
    case 'auto-cottage-rates':
      return [
        'Cottage rates (per tour):',
        ...COTTAGE_OPTIONS.filter(option => option.id).map(option => `• ${option.label}: ${peso(option.price)}`),
        `With a cottage only, each guest also pays the swimming entrance (day ${peso(day.adult)} adult / ${peso(day.child)} child; night ${peso(night.adult)} / ${peso(night.child)}).`,
        `Book a cottage at ${SITE}/book-cottage.`,
      ].join('\n');
    case 'auto-tour-rates':
      return [
        'Swimming entrance per person:',
        `• Day tour (${DAYTOUR_TIME_SLOT.checkIn}–${DAYTOUR_TIME_SLOT.checkOut}): ${peso(day.adult)} per person (adults and children)`,
        `• Night tour (${NIGHTTOUR_TIME_SLOT.checkIn}–${NIGHTTOUR_TIME_SLOT.checkOut}): ${peso(night.adult)} per person (adults and children)`,
        'For a tour you can book a room or just a cottage. Tap "Cottage rates" for cottage prices.',
      ].join('\n');
    case 'auto-times':
      return [
        'Check-in and check-out times:',
        ...OVERNIGHT_TIME_SLOTS.map(slot => `• Overnight: ${slot.label}`),
        `• Day tour: ${DAYTOUR_TIME_SLOT.checkIn} to ${DAYTOUR_TIME_SLOT.checkOut}`,
        `• Night tour: ${NIGHTTOUR_TIME_SLOT.checkIn} to ${NIGHTTOUR_TIME_SLOT.checkOut}`,
      ].join('\n');
    case 'auto-booking':
      return [
        `Book online at ${SITE}/book: choose your stay, dates and room (or cottage), then pay.`,
        `You can pay a ${RESERVATION_DEPOSIT_PERCENTAGE}% deposit or the full amount by GCash, Maya, GrabPay or card through PayMongo. The balance is paid at the resort.`,
        'Groups of 15 or more can book a corporate package at least 7 days ahead.',
        `To check a booking later, use your booking reference at ${SITE}/my-bookings.`,
      ].join('\n');
    case 'auto-cancellation': {
      const saved = normalizeCancellationPolicy(policy) || DEFAULT_CANCELLATION_POLICY;
      return [
        'Cancellation policy (based on the total package price):',
        ...describePolicyTiers(saved).map(tier => `• ${tier.label}: ${tier.rate}% fee`),
        `You can rebook (move your dates) for free at least ${saved.dateChangeDays} days before arrival. To cancel or rebook, contact us here or look up your booking at ${SITE}/my-bookings.`,
      ].join('\n');
    }
    case 'auto-location':
      return [
        'We are at 402 Brgy. Buguion, Calumpit, Bulacan.',
        'From Manila: NLEX → Pulilan Exit → follow the signs to Calumpit.',
        'Call or text 0917 811 2332 (daily, 7:00 AM – 10:00 PM) or email lawiswiskawayan123@gmail.com.',
      ].join('\n');
    default:
      return '';
  }
}

// Sent once in a while when the bot can't answer a typed message.
export const HANDOFF_MESSAGE = 'Thanks for your message! A staff member will reply here soon. For instant answers, tap a question below (room rates, cottages, tour rates, times, booking, cancellation, location).';
