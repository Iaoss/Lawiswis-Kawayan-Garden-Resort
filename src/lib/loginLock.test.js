import { LOGIN_LIMIT, LOOKUP_LIMIT, minutesLocked, registerFailure } from './loginLock';

describe('login lockout', () => {
  const t0 = Date.UTC(2026, 10, 8, 10, 0);
  test('locks on the 5th wrong password within 15 minutes, for 15 minutes', () => {
    let record = {};
    for (let i = 0; i < 4; i += 1) {
      record = registerFailure(record, t0 + i * 60000, LOGIN_LIMIT);
      expect(record.justLocked).toBe(false);
    }
    expect(record.attemptsLeft).toBe(1);
    record = registerFailure(record, t0 + 4 * 60000, LOGIN_LIMIT);
    expect(record.justLocked).toBe(true);
    expect(minutesLocked(record, t0 + 4 * 60000)).toBe(15);
    expect(minutesLocked(record, t0 + 20 * 60000)).toBe(0);
  });

  test('old wrong attempts outside the window do not count', () => {
    let record = {};
    for (let i = 0; i < 4; i += 1) record = registerFailure(record, t0 + i * 60000, LOGIN_LIMIT);
    record = registerFailure(record, t0 + 30 * 60000, LOGIN_LIMIT);
    expect(record.justLocked).toBe(false);
    expect(record.attemptsLeft).toBe(4);
  });

  test('booking lookups allow 10 wrong tries an hour', () => {
    let record = {};
    for (let i = 0; i < 9; i += 1) record = registerFailure(record, t0 + i * 1000, LOOKUP_LIMIT);
    expect(record.justLocked).toBe(false);
    expect(registerFailure(record, t0 + 10000, LOOKUP_LIMIT).justLocked).toBe(true);
  });
});
