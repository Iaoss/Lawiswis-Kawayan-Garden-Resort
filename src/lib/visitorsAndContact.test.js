import { calculateBookingPrice, getReservationDayVisitors, normalizeDayVisitors } from './bookingPricing';
import { getContactLinkError, isPreferredContactMethod, PREFERRED_CONTACT_METHODS } from './preferredContactMethods';
import { getReceiptLineItems } from './receiptItems';

const coupleRoom = { type: 'Couple Room', roomNumber: '101' };

describe('day visitors on an overnight stay', () => {
  it('adds the swimming rate once for each visitor', () => {
    const price = calculateBookingPrice({
      room: coupleRoom, bookingType: 'overnight', nights: 1, adults: 2, children: 0,
      dayVisitors: { adults: 1, children: 1, tourPeriod: 'day' },
    });
    expect(price.dayVisitorCharge).toBe(375 + 275);
    expect(price.subtotalAmount).toBe(3000 + 650);
    // Visitors don't use the room's guest count.
    expect(price.extraGuestCharge).toBe(0);
  });

  it('uses the night tour rate and is not charged per night', () => {
    const price = calculateBookingPrice({
      room: coupleRoom, bookingType: 'overnight', nights: 2, adults: 2, children: 0,
      dayVisitors: { adults: 2, children: 0, tourPeriod: 'night' },
    });
    expect(price.dayVisitorCharge).toBe(950);
    expect(price.subtotalAmount).toBe(6000 + 950);
  });

  it('ignores visitors on a day or night tour booking', () => {
    const price = calculateBookingPrice({
      room: coupleRoom, bookingType: 'daytour', nights: 1, adults: 2, children: 0,
      dayVisitors: { adults: 3, children: 0, tourPeriod: 'day' },
    });
    expect(price.dayVisitorCharge).toBe(0);
  });

  it('rejects too many or invalid visitors', () => {
    expect(() => normalizeDayVisitors({ adults: 11, children: 0 })).toThrow();
    expect(() => normalizeDayVisitors({ adults: -1, children: 0 })).toThrow();
    expect(normalizeDayVisitors({ adults: 0, children: 0 })).toBeNull();
  });

  it('keeps the visitors when a booking is repriced, and lists them on the receipt', () => {
    const reservation = {
      roomNumber: '101', roomType: 'Couple Room', bookingType: 'overnight', nights: 1, baseRate: 3000,
      dayVisitorAdults: 1, dayVisitorChildren: 0, dayVisitorPeriod: 'night', dayVisitorCharge: 475, totalAmount: 3475,
    };
    expect(getReservationDayVisitors(reservation)).toEqual({ adults: 1, children: 0, tourPeriod: 'night' });
    const items = getReceiptLineItems(reservation).booking;
    expect(items.find(item => item.label.startsWith('Day visitors'))).toEqual({ label: 'Day visitors (1 adult · night tour)', amount: 475 });
  });
});

describe('preferred contact method', () => {
  it('no longer offers Viber', () => {
    expect(PREFERRED_CONTACT_METHODS).toEqual(['Email', 'Phone', 'Facebook Messenger']);
    expect(isPreferredContactMethod('Viber')).toBe(false);
  });

  it('needs a Facebook link only for Facebook Messenger', () => {
    expect(getContactLinkError('Email', '')).toBe('');
    expect(getContactLinkError('Facebook Messenger', '')).toMatch(/Paste the link/);
    expect(getContactLinkError('Facebook Messenger', 'https://example.com/me')).toMatch(/Facebook profile link/);
    expect(getContactLinkError('Facebook Messenger', 'https://www.facebook.com/juan.delacruz')).toBe('');
    expect(getContactLinkError('Facebook Messenger', 'facebook.com/profile.php?id=1000')).toBe('');
    expect(getContactLinkError('Facebook Messenger', 'm.me/juan')).toBe('');
  });
});
