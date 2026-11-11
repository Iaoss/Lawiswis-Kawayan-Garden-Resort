// Who did it: "Maria Santos (Receptionist)". Used on chat replies, reports
// and bookings so staff can see which team member handled something.
const ROLE_LABELS = { admin: 'Admin', receptionist: 'Receptionist' };

export const roleLabel = role => ROLE_LABELS[String(role || '').toLowerCase()] || '';

export function staffLabel(name, role) {
  const who = String(name || '').trim() || 'Staff';
  const label = roleLabel(role);
  return label ? `${who} (${label})` : who;
}

// Fields saved on a record by the server: name and role at the time, so the
// record still says who it was if the account is renamed or removed later.
export const staffStamp = (staff, prefix) => ({
  [prefix]: staff?.uid || '',
  [`${prefix}Name`]: String(staff?.name || staff?.email || '').slice(0, 80),
  [`${prefix}Role`]: String(staff?.role || ''),
});

// Who booked a reservation, for the booking details.
export function bookedByText(reservation = {}) {
  if (reservation.createdByName) return `${staffLabel(reservation.createdByName, reservation.createdByRole)} · front desk`;
  if (reservation.createdBy) return 'Front desk (staff name not recorded)';
  return 'Guest · online booking';
}
