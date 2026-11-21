// Common fees staff add to a bill (damage, losses, extra cleaning…).
// Admins can rename them, set their prices, add or remove them in
// Settings → Resort Status → Common fees (saved in settings/extraFees).
// A fee without a price just fills in the description; staff type the amount.

export const DEFAULT_EXTRA_FEES = [
  { id: 'broken-furniture', label: 'Broken furniture (chair, table, bed frame)', amount: null },
  { id: 'damaged-linen', label: 'Damaged or stained bedsheet / linen', amount: null },
  { id: 'stained-mattress', label: 'Stained mattress (deep cleaning)', amount: null },
  { id: 'lost-towel', label: 'Lost or damaged towel', amount: null },
  { id: 'lost-key', label: 'Lost room key / key card', amount: null },
  { id: 'broken-dishware', label: 'Broken glass, plate or mug', amount: null },
  { id: 'appliance-damage', label: 'Damaged appliance or TV remote', amount: null },
  { id: 'bathroom-damage', label: 'Broken bathroom fixture', amount: null },
  { id: 'wall-damage', label: 'Wall or door damage (marks, holes)', amount: null },
  { id: 'smoking', label: 'Smoking inside the room (deep cleaning)', amount: null },
  { id: 'extra-cleaning', label: 'Extra cleaning (heavy mess)', amount: null },
  { id: 'missing-item', label: 'Missing item from the room', amount: null },
  { id: 'corkage', label: 'Corkage (outside food or drinks)', amount: null },
  { id: 'lost-wristband', label: 'Lost gate pass / wristband', amount: null },
];

const FEE_ID = /^[a-z0-9][a-z0-9-]{1,39}$/;

// Cleans a saved list. Returns null when there is no usable list.
export function normalizeExtraFees(doc) {
  const list = Array.isArray(doc?.fees) ? doc.fees : null;
  if (!list) return null;
  const seen = new Set();
  return list
    .map(fee => {
      const amount = fee?.amount === '' || fee?.amount === null || fee?.amount === undefined ? null : Math.round(Number(fee.amount) * 100) / 100;
      return { id: String(fee?.id || ''), label: String(fee?.label || '').trim().slice(0, 80), amount: Number.isFinite(amount) && amount > 0 && amount <= 1000000 ? amount : null };
    })
    .filter(fee => FEE_ID.test(fee.id) && fee.label.length >= 2 && !seen.has(fee.id) && seen.add(fee.id));
}

// A short id made from the fee's name.
export function feeIdFor(label, taken = new Set()) {
  const base = String(label || 'fee').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30) || 'fee';
  let id = base.length >= 2 ? base : `fee-${base}`;
  while (taken.has(id)) id = `${base}-${Math.random().toString(36).slice(2, 5)}`;
  return id;
}
