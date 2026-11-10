import { formatStayTime, getLiveStayLabels, toMillis } from './stayTimes';

// 3:00 PM, 4 Nov 2026, Philippine time.
const now = new Date('2026-11-04T07:00:00Z');
const at = iso => ({ toMillis: () => new Date(iso).getTime() });

describe('check-in and check-out time labels', () => {
  test('reads Firestore timestamps, seconds objects and ISO strings', () => {
    const ms = new Date('2026-11-04T06:00:00Z').getTime();
    expect(toMillis(at('2026-11-04T06:00:00Z'))).toBe(ms);
    expect(toMillis({ seconds: ms / 1000 })).toBe(ms);
    expect(toMillis('2026-11-04T06:00:00Z')).toBe(ms);
    expect(toMillis(null)).toBeNull();
  });

  test('shows only the time for today and adds the date for other days', () => {
    expect(formatStayTime(at('2026-11-04T06:00:00Z'), now)).toMatch(/^2:00\sPM$/i);
    expect(formatStayTime(at('2026-11-03T06:00:00Z'), now)).toMatch(/^Nov 3, 2:00\sPM$/i);
  });

  test('checked-in guests show the check-in time', () => {
    expect(getLiveStayLabels({ status: 'checked-in', checkedInAt: at('2026-11-04T06:00:00Z') }, now).map(l => l.type)).toEqual(['in']);
  });

  test('the check-out time shows for 5 minutes after check-out, then disappears', () => {
    const r = { status: 'checked-out', checkedInAt: at('2026-11-03T06:00:00Z'), checkedOutAt: at('2026-11-04T06:57:00Z') };
    expect(getLiveStayLabels(r, now).map(l => l.type)).toEqual(['in', 'out']);
    expect(getLiveStayLabels({ ...r, checkedOutAt: at('2026-11-04T06:54:00Z') }, now)).toEqual([]);
  });

  test('other statuses show nothing', () => {
    expect(getLiveStayLabels({ status: 'confirmed' }, now)).toEqual([]);
  });
});

describe('detailed stay timing', () => {
  const { scheduledMillis, formatDuration, describeTimingDifference, getStayTimingDetails } = require('./stayTimes');

  test('reads the booked time in Philippine time', () => {
    expect(scheduledMillis('2026-11-04', '2:00 PM')).toBe(new Date('2026-11-04T06:00:00Z').getTime());
    expect(scheduledMillis('2026-11-04', '10:00 AM / 11:00 AM')).toBe(new Date('2026-11-04T02:00:00Z').getTime());
    expect(scheduledMillis('2026-11-04', 'After 9:00 PM')).toBe(new Date('2026-11-04T13:00:00Z').getTime());
    expect(scheduledMillis('2026-11-04', '')).toBeNull();
  });

  test('describes early, late and on-time arrivals', () => {
    const booked = new Date('2026-11-04T06:00:00Z').getTime();
    expect(describeTimingDifference(booked + 3 * 60000, booked).text).toBe('On time');
    expect(describeTimingDifference(booked - 45 * 60000, booked).text).toBe('45 min early');
    expect(describeTimingDifference(booked + 65 * 60000, booked).text).toBe('1 h 5 min late');
    expect(formatDuration(26 * 3600000 + 5 * 60000)).toBe('1 day 2 h 5 min');
  });

  test('builds the full timing for a stay', () => {
    const details = getStayTimingDetails({
      checkIn: '2026-11-03', checkInTime: '2:00 PM', checkOut: '2026-11-04', checkOutTime: '12:00 PM',
      checkedInAt: at('2026-11-03T06:20:00Z'), checkedOutAt: at('2026-11-04T03:50:00Z'),
    });
    expect(details.checkIn.text).toBe('20 min late');
    expect(details.checkOut.text).toBe('10 min early');
    expect(details.duration).toBe('21 h 30 min');
    expect(details.checkIn.actual).toMatch(/Nov 3, 2026/);
  });
});

describe('check-in reminders', () => {
  const { getUpcomingCheckIns } = require('./stayTimes');
  const booking = { id: 'abc', status: 'confirmed', guestName: 'Ana', roomNumber: '101', checkIn: '2026-11-04', checkInTime: '2:00 PM' };
  const at = iso => new Date(iso).getTime();

  test('shows from 3 minutes before the booked check-in time', () => {
    expect(getUpcomingCheckIns([booking], at('2026-11-04T05:56:00Z'))).toEqual([]);
    const [item] = getUpcomingCheckIns([booking], at('2026-11-04T05:57:00Z'));
    expect(item).toMatchObject({ id: 'abc', guest: 'Ana', place: 'Room 101', whenText: 'in 3 min' });
  });

  test('stops after 15 minutes, and skips guests already checked in or cancelled', () => {
    expect(getUpcomingCheckIns([booking], at('2026-11-04T06:16:00Z'))).toEqual([]);
    expect(getUpcomingCheckIns([{ ...booking, status: 'checked-in' }], at('2026-11-04T05:58:00Z'))).toEqual([]);
    expect(getUpcomingCheckIns([{ ...booking, status: 'cancelled' }], at('2026-11-04T05:58:00Z'))).toEqual([]);
  });

  test('rooms booked together give one reminder', () => {
    const main = { ...booking, groupId: 'abc', roomNumber: 'Tadhana' };
    const second = { ...booking, id: 'def', groupId: 'abc', roomNumber: 'pagdurusa' };
    const items = getUpcomingCheckIns([second, main], at('2026-11-04T05:58:00Z'));
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ id: 'abc', ids: ['def', 'abc'], place: '2 rooms (pagdurusa, Tadhana)' });
  });
});
