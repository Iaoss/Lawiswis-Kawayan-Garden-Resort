import { getContactDetailsError, getContactFieldErrors } from './preferredContactMethods';
import { roomFloor, roomHasStairs } from './roomAccess';
import { discountKindsFor, isAwaitingDiscountReview, normalizeDiscountId } from './discountReview';
import { holdsRoom } from './unpaidBookings';
import { seniorPwdSummary } from './seniorPwdGuests';

describe('contact details', () => {
  it('needs only the preferred method', () => {
    expect(getContactDetailsError({ preferredContactMethod: 'Email', email: 'a@b.co' })).toBe('');
    expect(getContactDetailsError({ preferredContactMethod: 'Phone', phone: '09171234567' })).toBe('');
    expect(getContactDetailsError({ preferredContactMethod: 'Facebook Messenger', contactLink: 'https://facebook.com/ana' })).toBe('');
  });

  it('points at the field that is missing or wrong', () => {
    expect(getContactFieldErrors({ preferredContactMethod: 'Email', phone: '09171234567' }).email).toMatch(/chose Email/);
    expect(getContactFieldErrors({ preferredContactMethod: 'Phone', email: 'a@b.co' }).phone).toMatch(/chose Phone/);
    expect(getContactFieldErrors({ preferredContactMethod: 'Email', email: 'a@b.co', phone: '123' }).phone).toMatch(/11-digit/);
    expect(getContactFieldErrors({ preferredContactMethod: 'Phone', phone: '09171234567', email: 'nope' }).email).toMatch(/valid email/);
    expect(getContactFieldErrors({}).preferredContactMethod).toBeTruthy();
  });
});

describe('rooms with stairs', () => {
  it('reads the floor from the location, then the description', () => {
    expect(roomHasStairs({ location: 'Second floor, old building' })).toBe(true);
    expect(roomHasStairs({ location: 'First floor', description: 'Near the second floor stairs' })).toBe(false);
    expect(roomHasStairs({ location: 'Old building', description: 'Located on the 2nd floor.' })).toBe(true);
    expect(roomFloor({ location: 'Main building' })).toBe('unknown');
  });
});

describe('Senior / PWD discount requested online', () => {
  const photo = 'data:image/jpeg;base64,AAAA';
  const senior = { holderName: 'Ana Cruz', idNumber: 'OSCA-12345', birthDate: '1950-01-01', photo };

  it('checks each ID and its photo', () => {
    expect(discountKindsFor({ senior: 1, pwd: 2 })).toEqual(['senior', 'pwd', 'pwd']);
    expect(normalizeDiscountId(senior, 'senior', '2026-11-18').value.holderName).toBe('Ana Cruz');
    expect(normalizeDiscountId({ ...senior, birthDate: '2000-01-01' }, 'senior', '2026-11-18').error).toBeTruthy();
    expect(normalizeDiscountId({ ...senior, photo: 'https://example.com/a.jpg' }, 'senior', '2026-11-18').error).toMatch(/photo/);
    expect(normalizeDiscountId({ ...senior, photo: `data:image/jpeg;base64,${'A'.repeat(1000000)}` }, 'senior', '2026-11-18').error).toMatch(/too large/);
  });

  it('keeps the room while staff review, then lets the hold run out', () => {
    const booking = { type: 'online', status: 'pending', createdAt: '2026-11-18T00:00:00.000Z', discountReview: { status: 'pending', submittedAt: '2026-11-18T00:00:00.000Z' } };
    const at = hours => Date.parse('2026-11-18T00:00:00.000Z') + hours * 3600000;
    expect(isAwaitingDiscountReview(booking)).toBe(true);
    expect(holdsRoom(booking, at(47))).toBe(true);
    expect(holdsRoom(booking, at(49))).toBe(false);
    expect(seniorPwdSummary({ ...booking, seniorPwdDeclared: { senior: 1 } }).text).toMatch(/waiting for staff review/);
  });
});
