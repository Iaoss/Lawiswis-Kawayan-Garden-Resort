import { NAME_ALLOWED_CHARACTERS, NAME_PATTERN, joinGuestName, splitGuestName } from './nameValidation';

describe('guest name validation', () => {
  it.each([
    'José',
    "Anne-Marie",
    "O'Connor",
    'Mary Jane',
  ])('accepts supported characters in %s', name => {
    expect(NAME_PATTERN.test(name)).toBe(true);
    expect(NAME_ALLOWED_CHARACTERS.test(name)).toBe(true);
  });

  it.each(['A', 'John2', 'Jane!', ' 李'])('rejects invalid name %s', name => {
    expect(NAME_PATTERN.test(name)).toBe(false);
  });

  it('splits and joins legacy full names without losing multi-part surnames', () => {
    const names = splitGuestName('  Maria  Del Rosario  ');

    expect(names).toEqual({ firstName: 'Maria', lastName: 'Del Rosario' });
    expect(joinGuestName(names.firstName, names.lastName)).toBe('Maria Del Rosario');
  });
});
