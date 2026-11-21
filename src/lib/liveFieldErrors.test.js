import { guestFieldError, nameError, phoneTypingError } from './liveFieldErrors';

test('names are checked on their own', () => {
  expect(nameError('')).toBe('This is required.');
  expect(nameError('J')).toMatch(/2-35/);
  expect(nameError('J4n')).toMatch(/Numbers/);
  expect(nameError('Juan')).toBe('');
});

test('a mobile number is flagged while typing once it cannot be valid', () => {
  expect(phoneTypingError('')).toBe('');
  expect(phoneTypingError('0')).toBe('');
  expect(phoneTypingError('09')).toBe('');
  expect(phoneTypingError('8')).toMatch(/start with 09/);
  expect(phoneTypingError('08')).toMatch(/start with 09/);
  expect(phoneTypingError('0917123')).toBe('');
  expect(phoneTypingError('09171234567')).toBe('');
});

test('contact fields use the booking rules', () => {
  expect(guestFieldError('phone', { phone: '0917', preferredContactMethod: 'Phone' })).toMatch(/11-digit/);
  expect(guestFieldError('email', { email: 'juan@', preferredContactMethod: 'Email' })).toMatch(/valid email/);
  expect(guestFieldError('email', { email: '', preferredContactMethod: 'Phone', phone: '09171234567' })).toBe('');
  expect(guestFieldError('address', {})).toBe('');
});
