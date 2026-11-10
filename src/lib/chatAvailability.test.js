import { buildAvailabilityAnswer, normalizeAvailabilityRequest } from './chatAvailability';
import { detectTopic, handoffMessage, HANDOFF_MESSAGE } from './chatAutoReply';

const NOW = new Date('2026-11-09T04:00:00Z'); // noon in Manila
const rooms = [
  { id: 'r1', roomNumber: 'Irog', type: 'couple', status: 'available' },
  { id: 'r2', roomNumber: 'Halimuyak', type: 'familyRoom', capacity: 4, status: 'available' },
  { id: 'r3', roomNumber: 'Paraiso', type: 'suite', status: 'available' },
  { id: 'r4', roomNumber: 'Sira', type: 'couple', status: 'maintenance' },
];
const booking = (roomId, checkIn, checkOut, status = 'confirmed') => ({ roomId, checkIn, checkOut, status, paymentStatus: 'paid' });

describe('chat availability', () => {
  it('checks the dates and guests', () => {
    expect(normalizeAvailabilityRequest({ checkIn: '2026-11-20', checkOut: '2026-11-21', guests: 2 }, NOW)).toEqual({ checkIn: '2026-11-20', checkOut: '2026-11-21', guests: 2 });
    expect(normalizeAvailabilityRequest({ checkIn: '2026-11-01', checkOut: '2026-11-02', guests: 2 }, NOW).error).toMatch(/past/);
    expect(normalizeAvailabilityRequest({ checkIn: '2026-11-20', checkOut: '2026-11-20', guests: 2 }, NOW).error).toMatch(/after check-in/);
    expect(normalizeAvailabilityRequest({ checkIn: '2026-11-20', checkOut: '2027-02-01', guests: 2 }, NOW).error).toMatch(/up to/);
    expect(normalizeAvailabilityRequest({ checkIn: '2026-11-20', checkOut: '2026-11-21', guests: 0 }, NOW).error).toMatch(/guests/);
  });

  it('lists free rooms that fit, best fit first, with a booking link', () => {
    const answer = buildAvailabilityAnswer({ rooms, reservations: [booking('r2', '2026-11-20', '2026-11-22')], checkIn: '2026-11-20', checkOut: '2026-11-21', guests: 2 });
    expect(answer).toMatch(/Good news/);
    expect(answer).toMatch(/Irog/);
    expect(answer).not.toMatch(/Halimuyak/); // booked
    expect(answer).not.toMatch(/Sira/); // maintenance
    expect(answer).toMatch(/₱3,000 total/);
    expect(answer).toMatch(/\/book\?type=personal&stay=overnight&checkIn=2026-11-20&checkOut=2026-11-21&adults=2/);
  });

  it('ignores cancelled bookings', () => {
    const answer = buildAvailabilityAnswer({ rooms, reservations: [booking('r2', '2026-11-20', '2026-11-22', 'cancelled')], checkIn: '2026-11-20', checkOut: '2026-11-21', guests: 4 });
    expect(answer).toMatch(/Halimuyak/);
  });

  it('says when everything is booked', () => {
    const all = ['r1', 'r2', 'r3'].map(id => booking(id, '2026-11-20', '2026-11-21'));
    expect(buildAvailabilityAnswer({ rooms, reservations: all, checkIn: '2026-11-20', checkOut: '2026-11-21', guests: 2 })).toMatch(/all rooms are booked/);
  });

  it('points big groups to the group packages', () => {
    expect(buildAvailabilityAnswer({ rooms, reservations: [], checkIn: '2026-11-20', checkOut: '2026-11-21', guests: 20 })).toMatch(/corporate-booking/);
  });
});

describe('chat keywords and hours', () => {
  it('spots availability questions', () => {
    expect(detectTopic('may bakante po ba sa dec 24?')).toBe('auto-availability');
    expect(detectTopic('is a room available this weekend')).toBe('auto-availability');
    expect(detectTopic('fully booked na ba kayo')).toBe('auto-availability');
  });

  it('tells guests when staff will reply', () => {
    expect(handoffMessage(new Date('2026-11-09T04:00:00Z'))).toBe(HANDOFF_MESSAGE); // 12 PM Manila
    expect(handoffMessage(new Date('2026-11-09T16:00:00Z'))).toMatch(/in the morning/); // 12 AM Manila
  });
});
