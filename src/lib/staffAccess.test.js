import { describeExpiry, getActiveGrants, getGrantExpiry, hasFeature, isGrantActive } from './staffAccess';

const now = Date.parse('2026-10-26T04:00:00Z');
const ts = iso => ({ seconds: Date.parse(iso) / 1000 });

describe('extra access for receptionists', () => {
  const receptionist = {
    role: 'receptionist',
    access: {
      reports: { expiresAt: ts('2026-10-26T08:00:00Z') }, // ends in 4 hours
      refunds: { expiresAt: null }, // until removed
      news: { expiresAt: ts('2026-10-25T00:00:00Z') }, // already ended
      users: { expiresAt: null }, // not a grantable feature
    },
  };

  test('admins have every feature', () => {
    expect(hasFeature({ role: 'admin' }, 'reports', now)).toBe(true);
    expect(hasFeature({ role: 'admin' }, 'refunds', now)).toBe(true);
  });

  test('receptionists only have features with an active grant', () => {
    expect(hasFeature(receptionist, 'reports', now)).toBe(true);
    expect(hasFeature(receptionist, 'refunds', now)).toBe(true);
    expect(hasFeature(receptionist, 'news', now)).toBe(false);
    expect(hasFeature(receptionist, 'promos', now)).toBe(false);
    expect(hasFeature(receptionist, 'users', now)).toBe(false);
    expect(hasFeature({ role: 'receptionist' }, 'reports', now)).toBe(false);
    expect(hasFeature(null, 'reports', now)).toBe(false);
  });

  test('temporary access ends at its time', () => {
    expect(hasFeature(receptionist, 'reports', Date.parse('2026-10-26T08:00:01Z'))).toBe(false);
    expect(isGrantActive({ expiresAt: null }, now)).toBe(true);
  });

  test('lists active grants, soonest to end first', () => {
    expect(getActiveGrants(receptionist, now).map(g => g.id)).toEqual(['reports', 'refunds']);
  });

  test('works out when a grant ends', () => {
    const start = new Date(now);
    expect(getGrantExpiry('4h', '', start).expiresAt.getTime()).toBe(now + 4 * 3600000);
    expect(getGrantExpiry('manual', '', start)).toEqual({ expiresAt: null });
    expect(getGrantExpiry('custom', '2026-10-26T04:01:00Z', start).error).toMatch(/5 minutes/);
    expect(getGrantExpiry('custom', '2026-10-28T04:00:00Z', start).expiresAt.getTime()).toBe(Date.parse('2026-10-28T04:00:00Z'));
    expect(getGrantExpiry('nope', '', start).error).toBeTruthy();
  });

  test('describes the time left', () => {
    expect(describeExpiry(null, now)).toBe('Until removed');
    expect(describeExpiry(now + 30 * 60000, now)).toBe('30 min left');
    expect(describeExpiry(now + 5 * 3600000, now)).toBe('5 h left');
    expect(describeExpiry(now + 3 * 86400000, now)).toBe('3 days left');
    expect(describeExpiry(now - 1, now)).toBe('Expired');
  });
});
