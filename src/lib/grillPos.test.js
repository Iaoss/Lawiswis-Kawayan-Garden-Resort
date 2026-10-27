import {
  addItem, changeQty, dayKey, formatPeso, hasTag, itemCount, orderTotal,
  salesSummary, toggleTag, validateOrder,
} from './grillPos';

const bbq = { id: 'bbq', name: 'Pork BBQ', price: 30 };
const rice = { id: 'rice', name: 'Rice', price: 15 };

describe('grill POS orders', () => {
  test('tapping a product adds it, tapping again adds one more', () => {
    let items = addItem([], bbq);
    items = addItem(items, bbq);
    items = addItem(items, rice);
    expect(items).toEqual([
      { productId: 'bbq', name: 'Pork BBQ', price: 30, qty: 2 },
      { productId: 'rice', name: 'Rice', price: 15, qty: 1 },
    ]);
    expect(orderTotal(items)).toBe(75);
    expect(itemCount(items)).toBe(3);
  });

  test('minus removes a line when it reaches zero', () => {
    const items = changeQty(addItem([], rice), 'rice', -1);
    expect(items).toEqual([]);
  });

  test('identifier tags toggle on and off', () => {
    let id = toggleTag('', 'Guy in cap');
    id = toggleTag(id, 'Red shirt');
    expect(id).toBe('Guy in cap, Red shirt');
    expect(hasTag(id, 'red shirt')).toBe(true);
    expect(toggleTag(id, 'Guy in cap')).toBe('Red shirt');
  });

  test('an order needs items, a description and a status', () => {
    expect(validateOrder({ items: [], identifier: 'Cap', status: 'paid' })).toMatch(/product/);
    expect(validateOrder({ items: [{ qty: 1 }], identifier: ' ', status: 'paid' })).toMatch(/description/);
    expect(validateOrder({ items: [{ qty: 1 }], identifier: 'Cap', status: 'maybe' })).toMatch(/Paid/);
    expect(validateOrder({ items: [{ qty: 1 }], identifier: 'Cap', status: 'unpaid' })).toBe('');
  });

  test('summary splits paid and unpaid', () => {
    expect(salesSummary([{ total: 100, status: 'paid' }, { total: 40, status: 'unpaid' }]))
      .toEqual({ paid: 100, unpaid: 40, count: 2 });
  });

  test('formats day and pesos', () => {
    expect(dayKey(new Date(2026, 0, 5))).toBe('2026-01-05');
    expect(formatPeso(1250)).toBe('₱1,250');
  });
});
