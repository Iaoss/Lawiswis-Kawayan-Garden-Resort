// What receptionists see on their dashboard, chosen by an admin
// (Settings → Dashboard). Saved in settings/receptionistDashboard as
//   { sections: { stats: true, arrivals: true, ... } }
// Missing values count as shown, so nothing disappears until an admin
// turns it off.
export const RECEPTIONIST_DASHBOARD_SECTIONS = [
  { id: 'stats', label: 'Summary cards', desc: 'Arrivals, departures, checked-in guests, pending payments, rooms', icon: 'ti-layout-cards' },
  { id: 'arrivals', label: 'Today’s arrivals & departures', desc: 'Lists with the one-click check-in for paid guests', icon: 'ti-door-enter' },
  { id: 'quickActions', label: 'Quick actions', desc: 'Shortcuts to walk-in, billing, rooms and messages', icon: 'ti-bolt' },
  { id: 'feedback', label: 'Guest satisfaction', desc: 'Live summary of QR feedback ratings', icon: 'ti-star' },
  { id: 'tasks', label: 'Tasks & overstays', desc: 'Shared task list and guests past check-out', icon: 'ti-checklist' },
  { id: 'calendar', label: 'Calendar', desc: 'Bookings and tasks by day', icon: 'ti-calendar' },
];

export function getReceptionistSections(doc) {
  const saved = doc && typeof doc.sections === 'object' ? doc.sections : {};
  return Object.fromEntries(RECEPTIONIST_DASHBOARD_SECTIONS.map(section => [section.id, saved[section.id] !== false]));
}
