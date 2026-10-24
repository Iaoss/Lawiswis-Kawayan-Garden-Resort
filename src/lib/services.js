// Extra services staff can add to a guest's bill (Billing page), priced from
// the resort rate card. The server prices them again with this same code, so
// the amount can't be changed in the browser.

export const SERVICES = [
  {
    id: 'spa',
    label: 'Spa',
    summary: '₱1,000 per hour · 20% off for room guests',
    hourly: 1000,
    roomGuestDiscount: 20, // % off for guests with a room booking (rate card)
    minHours: 1,
    maxHours: 8,
  },
  {
    id: 'photoshoot',
    label: 'Photoshoot Package',
    summary: '₱3,500 for up to 5 people and 4 hours (8 AM–5 PM) · +₱300 per extra person · +₱500 per extra hour',
    base: 3500,
    includedPersons: 5,
    includedHours: 4,
    extraPerson: 300,
    extraHour: 500,
    maxPersons: 50,
    maxHours: 9, // 8 AM–5 PM
  },
];

export function getService(serviceId) {
  return SERVICES.find(service => service.id === serviceId) || null;
}

// Price for a service. Returns { error } or { amount, description, breakdown }.
// `roomGuest`: the booking includes a room (gets the spa discount).
export function priceService(serviceId, { hours, persons, roomGuest = false } = {}) {
  const service = getService(serviceId);
  if (!service) return { error: 'Choose a service.' };
  const h = Number(hours);

  if (service.id === 'spa') {
    if (!Number.isInteger(h) || h < service.minHours || h > service.maxHours) {
      return { error: `Spa time must be ${service.minHours}–${service.maxHours} whole hours.` };
    }
    const full = h * service.hourly;
    const discount = roomGuest ? Math.round(full * service.roomGuestDiscount) / 100 : 0;
    return {
      amount: full - discount,
      description: `Spa · ${h} hour${h === 1 ? '' : 's'}${discount ? ` (${service.roomGuestDiscount}% room-guest discount)` : ''}`,
      breakdown: [
        [`${h} × ₱${service.hourly.toLocaleString()} per hour`, full],
        ...(discount ? [[`${service.roomGuestDiscount}% room-guest discount`, -discount]] : []),
      ],
    };
  }

  const p = Number(persons);
  if (!Number.isInteger(p) || p < 1 || p > service.maxPersons) return { error: `Enter 1–${service.maxPersons} people.` };
  if (!Number.isInteger(h) || h < service.includedHours || h > service.maxHours) {
    return { error: `The package is ${service.includedHours}–${service.maxHours} hours (8 AM–5 PM only).` };
  }
  const extraPeople = Math.max(0, p - service.includedPersons);
  const extraHours = Math.max(0, h - service.includedHours);
  const amount = service.base + extraPeople * service.extraPerson + extraHours * service.extraHour;
  return {
    amount,
    description: `Photoshoot Package · ${p} ${p === 1 ? 'person' : 'people'}, ${h} hours`,
    breakdown: [
      [`Package (up to ${service.includedPersons} people, ${service.includedHours} hours)`, service.base],
      ...(extraPeople ? [[`${extraPeople} extra ${extraPeople === 1 ? 'person' : 'people'} × ₱${service.extraPerson}`, extraPeople * service.extraPerson]] : []),
      ...(extraHours ? [[`${extraHours} extra hour${extraHours === 1 ? '' : 's'} × ₱${service.extraHour}`, extraHours * service.extraHour]] : []),
    ],
  };
}

// Room bookings (not corporate packages) get the spa discount.
export const isRoomGuest = reservation => Boolean(reservation?.roomId) && reservation?.type !== 'corporate';
