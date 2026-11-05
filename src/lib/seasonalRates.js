// Holiday and peak-season prices. An admin sets periods (Settings →
// Seasonal rates), saved in settings/seasonalRates as
//   { periods: [{ id, name, from: 'YYYY-MM-DD', to: 'YYYY-MM-DD', percent }] }
// `percent` raises (e.g. 20) or lowers (e.g. -10) the room charge for the
// nights (or tour day) inside the period. Cottages, entrance fees and group
// packages aren't affected. Used by the website, walk-ins and the server
// (calculateBookingPrice), so the price is the same everywhere.

const DATE = /^\d{4}-\d{2}-\d{2}$/;
export const MAX_SEASON_PERCENT = 100;
export const MIN_SEASON_PERCENT = -50;

export function normalizeSeasonPeriods(doc) {
  const list = Array.isArray(doc?.periods) ? doc.periods : [];
  return list
    .map(period => ({
      id: String(period?.id || ''),
      name: String(period?.name || '').trim().slice(0, 40),
      from: String(period?.from || ''),
      to: String(period?.to || ''),
      percent: Math.round(Number(period?.percent) * 10) / 10,
    }))
    .filter(period => period.id && period.name && DATE.test(period.from) && DATE.test(period.to) && period.to >= period.from
      && Number.isFinite(period.percent) && period.percent !== 0
      && period.percent <= MAX_SEASON_PERCENT && period.percent >= MIN_SEASON_PERCENT)
    .sort((a, b) => a.from.localeCompare(b.from));
}

export function getSeasonPeriodError(period, others = []) {
  if (!period.name || period.name.trim().length < 2) return 'Give the period a name, like "Holy Week".';
  if (!DATE.test(period.from) || !DATE.test(period.to)) return 'Choose the start and end dates.';
  if (period.to < period.from) return 'The end date must be on or after the start date.';
  const percent = Number(period.percent);
  if (!Number.isFinite(percent) || percent === 0) return 'Enter the change in percent, like 20 for 20% more.';
  if (percent > MAX_SEASON_PERCENT || percent < MIN_SEASON_PERCENT) return `Use a change between ${MIN_SEASON_PERCENT}% and +${MAX_SEASON_PERCENT}%.`;
  const clash = others.find(other => other.id !== period.id && other.from <= period.to && period.from <= other.to);
  if (clash) return `These dates overlap "${clash.name}". Periods can't overlap.`;
  return '';
}

const addDays = (key, days) => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
};

// The dates that are charged: each night for overnight stays (check-in up
// to the night before check-out), or the single day of a tour.
export function chargedDates(checkIn, checkOut, bookingType) {
  if (!DATE.test(String(checkIn || ''))) return [];
  if (bookingType !== 'overnight' || !DATE.test(String(checkOut || '')) || checkOut <= checkIn) return [checkIn];
  const dates = [];
  for (let day = checkIn; day < checkOut && dates.length < 60; day = addDays(day, 1)) dates.push(day);
  return dates;
}

// The extra (or reduced) amount for the room charge over the stay.
// roomCharge is the room's charge for all units (nights or the tour day).
export function getSeasonalAdjustment({ periods = [], checkIn, checkOut, bookingType, roomCharge }) {
  const dates = chargedDates(checkIn, checkOut, bookingType);
  const charge = Number(roomCharge);
  if (!periods.length || !dates.length || !(charge > 0)) return { amount: 0, label: '', periods: [] };
  const perUnit = charge / dates.length;
  const used = new Map();
  let amount = 0;
  dates.forEach(date => {
    const period = periods.find(p => p.from <= date && date <= p.to);
    if (!period) return;
    amount += perUnit * period.percent / 100;
    used.set(period.id, { ...period, units: (used.get(period.id)?.units || 0) + 1 });
  });
  const list = [...used.values()];
  const unit = bookingType === 'overnight' ? 'night' : 'day';
  const label = list.map(p => `${p.name} ${p.percent > 0 ? '+' : ''}${p.percent}%${dates.length > 1 ? ` (${p.units} ${unit}${p.units === 1 ? '' : 's'})` : ''}`).join(', ');
  return { amount: Math.round(amount * 100) / 100, label, periods: list };
}
