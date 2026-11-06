// Planned closed dates (maintenance, private event): the resort is closed on
// these days, but guests can still book any other dates. Both days are
// included (Nov 23 – Nov 25 closes the 23rd, 24th and 25th).
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function normalizeClosedDates(list) {
  if (!Array.isArray(list)) return [];
  return list
    .map(item => ({
      id: String(item?.id || '').slice(0, 40) || `closed_${String(item?.from || '')}`,
      from: String(item?.from || '').slice(0, 10),
      to: String(item?.to || item?.from || '').slice(0, 10),
      reason: String(item?.reason || '').trim().slice(0, 120),
    }))
    .filter(item => DATE.test(item.from) && DATE.test(item.to) && item.to >= item.from)
    .sort((a, b) => a.from.localeCompare(b.from))
    .slice(0, 30);
}

export function getClosedDatesError(list) {
  if (!Array.isArray(list)) return 'Closed dates must be a list.';
  if (list.length > 30) return 'Add at most 30 closed periods.';
  for (const item of list) {
    if (!DATE.test(String(item?.from || '')) || !DATE.test(String(item?.to || ''))) return 'Choose a start and end date for each closed period.';
    if (item.to < item.from) return 'The end date must be on or after the start date.';
  }
  return '';
}

// Closed periods that haven't ended yet.
export const upcomingClosedDates = (list, todayKey) => normalizeClosedDates(list).filter(item => item.to >= todayKey);

// The closed period a stay touches, or null. A same-day visit (day tour)
// uses checkIn = checkOut. For overnight stays the check-out morning counts
// too, since the guest is still at the resort.
export function findClosedPeriod(list, checkIn, checkOut) {
  const start = String(checkIn || '').slice(0, 10);
  const end = String(checkOut || checkIn || '').slice(0, 10);
  if (!DATE.test(start)) return null;
  return normalizeClosedDates(list).find(item => start <= item.to && (end || start) >= item.from) || null;
}

export function formatClosedRange(item) {
  const label = key => {
    const [y, m, d] = key.split('-').map(Number);
    return { text: `${MONTHS[m - 1]} ${d}`, y };
  };
  const a = label(item.from);
  const b = label(item.to);
  if (item.from === item.to) return `${a.text}, ${a.y}`;
  return a.y === b.y ? `${a.text} – ${b.text}, ${b.y}` : `${a.text}, ${a.y} – ${b.text}, ${b.y}`;
}

export function closedPeriodMessage(item) {
  return `The resort is closed ${formatClosedRange(item)}${item.reason ? ` (${item.reason})` : ''}. Please choose other dates.`;
}
