import { AVATAR_COLORS, AVATAR_PRESETS, getBeamData, guestAvatarSeed } from '../components/ui/beam-avatar.tsx';

describe('avatars', () => {
  test('the same seed always gives the same avatar, in the resort colours', () => {
    expect(getBeamData('Maria Santos')).toEqual(getBeamData('Maria Santos'));
    AVATAR_PRESETS.forEach(seed => {
      const data = getBeamData(seed);
      expect(AVATAR_COLORS).toContain(data.wrapperColor);
      expect(AVATAR_COLORS).toContain(data.backgroundColor);
    });
  });

  test('guests keep one avatar: phone first, then email, then name', () => {
    expect(guestAvatarSeed({ phone: '0917 811 2332', email: 'a@b.com' })).toBe('phone:09178112332');
    expect(guestAvatarSeed({ guestPhone: '09178112332' })).toBe('phone:09178112332');
    expect(guestAvatarSeed({ email: 'Guest@Mail.com' })).toBe('email:guest@mail.com');
    expect(guestAvatarSeed({ guestName: 'Juan Cruz' })).toBe('name:juan cruz');
    expect(guestAvatarSeed({})).toBe('id:guest');
  });
});
