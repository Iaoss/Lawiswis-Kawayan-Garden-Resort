import { normalizeSeniorPwdDeclared, seniorPwdSummary } from './seniorPwdGuests';

describe('senior citizen and PWD guests', () => {
  it('checks the numbers against the group size', () => {
    expect(normalizeSeniorPwdDeclared({ senior: '1', pwd: 2 }, 4)).toEqual({ value: { senior: 1, pwd: 2 } });
    expect(normalizeSeniorPwdDeclared({}, 4)).toEqual({ value: { senior: 0, pwd: 0 } });
    expect(normalizeSeniorPwdDeclared({ senior: 3, pwd: 2 }, 4).error).toMatch(/4 guests/);
    expect(normalizeSeniorPwdDeclared({ senior: 1.5 }, 4).error).toMatch(/whole numbers/);
  });

  it('tells staff what still needs an ID check', () => {
    expect(seniorPwdSummary({})).toBeNull();
    expect(seniorPwdSummary({ seniorPwdDeclared: { senior: 1, pwd: 1 } })).toMatchObject({ toCheck: 2, text: '1 senior citizen, 1 PWD · check IDs and apply the discount' });
    expect(seniorPwdSummary({ seniorPwdDeclared: { senior: 1, pwd: 0 }, discounts: [{ kind: 'senior' }] })).toMatchObject({ toCheck: 0, text: '1 senior citizen · discount applied' });
    // Walk-in discounts with nothing declared online still show.
    expect(seniorPwdSummary({ discounts: [{ kind: 'pwd' }, { kind: 'pwd' }] })).toMatchObject({ pwd: 2, text: '2 PWDs · discount applied' });
  });
});
