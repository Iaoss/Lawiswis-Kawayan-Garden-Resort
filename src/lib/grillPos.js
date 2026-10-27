// Order math for the Ihaw-Ihaw (grill) point of sale.
// Kept free of React and Firebase so it can be tested on its own.

export const ORDER_STATUSES = ['unpaid', 'paid'];

// Starter menu an admin can load with one tap, then edit.
export const SAMPLE_MENU = [
  { name: 'Pork BBQ', price: 30, category: 'Ihaw' },
  { name: 'Chicken BBQ', price: 35, category: 'Ihaw' },
  { name: 'Isaw (Chicken)', price: 10, category: 'Ihaw' },
  { name: 'Isaw (Pork)', price: 12, category: 'Ihaw' },
  { name: 'Betamax', price: 10, category: 'Ihaw' },
  { name: 'Adidas', price: 20, category: 'Ihaw' },
  { name: 'Tenga', price: 20, category: 'Ihaw' },
  { name: 'Hotdog', price: 25, category: 'Ihaw' },
  { name: 'Chicken Leg', price: 90, category: 'Ihaw' },
  { name: 'Liempo', price: 120, category: 'Ihaw' },
  { name: 'Rice', price: 15, category: 'Extras' },
  { name: 'Puso', price: 10, category: 'Extras' },
  { name: 'Softdrinks', price: 25, category: 'Drinks' },
  { name: 'Bottled Water', price: 20, category: 'Drinks' },
];

// Quick tags staff tap to remember who ordered (no names needed).
export const IDENTIFIER_TAGS = [
  'Guy in cap', 'Girl with glasses', 'Guy with glasses', 'Lola', 'Lolo', 'Kid',
  'Couple', 'Barkada', 'Family', 'With baby',
  'Red shirt', 'Blue shirt', 'White shirt', 'Black shirt', 'Yellow shirt',
  'Long hair', 'Bald', 'Tall', 'Mustache', 'With umbrella',
];

export const MAX_IDENTIFIER_LENGTH = 80;

const toNumber = value => {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
};

// Tap a product: add one, or start a new line at 1.
export function addItem(items, product) {
  const found = items.find(item => item.productId === product.id);
  if (found) {
    return items.map(item => (item.productId === product.id ? { ...item, qty: item.qty + 1 } : item));
  }
  return [...items, { productId: product.id, name: product.name, price: toNumber(product.price), qty: 1 }];
}

// + / − on a receipt line. A line that reaches 0 is removed.
export function changeQty(items, productId, delta) {
  return items
    .map(item => (item.productId === productId ? { ...item, qty: item.qty + delta } : item))
    .filter(item => item.qty > 0);
}

export const lineTotal = item => toNumber(item.price) * toNumber(item.qty);
export const orderTotal = items => items.reduce((sum, item) => sum + lineTotal(item), 0);
export const itemCount = items => items.reduce((sum, item) => sum + toNumber(item.qty), 0);

// Tap a tag to add it to the description; tap again to take it out.
export function toggleTag(identifier, tag) {
  const parts = identifier.split(',').map(part => part.trim()).filter(Boolean);
  const next = parts.some(part => part.toLowerCase() === tag.toLowerCase())
    ? parts.filter(part => part.toLowerCase() !== tag.toLowerCase())
    : [...parts, tag];
  return next.join(', ').slice(0, MAX_IDENTIFIER_LENGTH);
}

export const hasTag = (identifier, tag) =>
  identifier.split(',').some(part => part.trim().toLowerCase() === tag.toLowerCase());

// Returns an error message, or '' when the order can be saved.
export function validateOrder({ items, identifier, status }) {
  if (!items.length) return 'Tap at least one product.';
  if (!identifier.trim()) return 'Add a description so staff can find the customer (e.g. "Guy in cap").';
  if (identifier.length > MAX_IDENTIFIER_LENGTH) return `Keep the description under ${MAX_IDENTIFIER_LENGTH} characters.`;
  if (!ORDER_STATUSES.includes(status)) return 'Choose Paid or Unpaid.';
  return '';
}

// Local calendar day, used to group orders by day (e.g. "2026-10-27").
export function dayKey(date = new Date()) {
  const pad = number => String(number).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export const formatPeso = amount =>
  `₱${toNumber(amount).toLocaleString('en-PH', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

export function salesSummary(orders) {
  return orders.reduce((summary, order) => {
    const total = toNumber(order.total);
    if (order.status === 'paid') summary.paid += total;
    else summary.unpaid += total;
    summary.count += 1;
    return summary;
  }, { paid: 0, unpaid: 0, count: 0 });
}
