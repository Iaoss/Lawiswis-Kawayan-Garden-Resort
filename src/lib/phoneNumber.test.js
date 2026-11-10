import { PH_MOBILE, normalizePhMobile } from './phoneNumber';

test('accepts only Philippine mobile numbers', () => {
  expect(PH_MOBILE.test('09171234567')).toBe(true);
  expect(normalizePhMobile('0917 123 4567')).toBe('09171234567');
  expect(normalizePhMobile('+63 917 123 4567')).toBe('09171234567');
  expect(normalizePhMobile('aasassssssss')).toBe('');
  expect(normalizePhMobile('0917123456')).toBe('');
  expect(normalizePhMobile('08171234567')).toBe('');
});
