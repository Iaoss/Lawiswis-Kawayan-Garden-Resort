import { bookedByText, staffLabel, staffStamp } from './staffLabel';

describe('who handled it', () => {
  it('shows the staff name and role', () => {
    expect(staffLabel('Maria Santos', 'receptionist')).toBe('Maria Santos (Receptionist)');
    expect(staffLabel('Mike', 'admin')).toBe('Mike (Admin)');
    expect(staffLabel('', '')).toBe('Staff');
  });

  it('saves the uid, name and role under one prefix', () => {
    expect(staffStamp({ uid: 'u1', name: 'Maria', role: 'receptionist' }, 'checkedInBy'))
      .toEqual({ checkedInBy: 'u1', checkedInByName: 'Maria', checkedInByRole: 'receptionist' });
    expect(staffStamp({ uid: 'u2', email: 'desk@resort.ph', role: 'admin' }, 'createdBy').createdByName).toBe('desk@resort.ph');
  });

  it('says who booked a reservation', () => {
    expect(bookedByText({ createdBy: 'u1', createdByName: 'Maria', createdByRole: 'receptionist' })).toBe('Maria (Receptionist) · front desk');
    expect(bookedByText({ createdBy: 'u1' })).toMatch(/not recorded/);
    expect(bookedByText({ source: 'online' })).toBe('Guest · online booking');
  });
});
