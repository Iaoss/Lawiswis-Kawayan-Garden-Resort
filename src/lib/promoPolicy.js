export function normalizePromoCode(code) {
  return String(code || '').trim().toUpperCase();
}

// Today's date at the resort (Philippine time), YYYY-MM-DD. Server code runs
// in UTC, which would keep a code usable until 8 AM the day after it ends.
export function manilaToday(now = Date.now()) {
  return new Date(now + 8 * 3600000).toISOString().slice(0, 10);
}

// True once the code's last valid day has passed.
export function isPromoExpired(promo, today = manilaToday()) {
  return Boolean(promo?.validUntil) && String(promo.validUntil).slice(0, 10) < today;
}

// What the Promo Codes page shows: expired codes count as inactive even if
// the switch is still on (the daily job turns it off).
export function getPromoStatus(promo, today = manilaToday()) {
  if (isPromoExpired(promo, today)) return { key: 'expired', label: 'Expired' };
  if (!promo?.active) return { key: 'inactive', label: 'Inactive' };
  const limit = promo.usageLimit === '' || promo.usageLimit === null || promo.usageLimit === undefined ? null : Number(promo.usageLimit);
  if (limit !== null && Number(promo.usageCount || 0) >= limit) return { key: 'used-up', label: 'Used up' };
  if (promo.validFrom && today < promo.validFrom) return { key: 'scheduled', label: 'Starts later' };
  return { key: 'active', label: 'Active' };
}

export function evaluatePromo(promo, subtotal, today = manilaToday()) {
  if (!promo) return { valid: false, error: 'Invalid code' };
  if (!promo.active) return { valid: false, error: 'This code is inactive' };
  if (promo.validFrom && today < promo.validFrom) return { valid: false, error: 'Code is not active yet' };
  if (promo.validUntil && today > promo.validUntil) return { valid: false, error: 'Code expired' };

  const usageLimit = promo.usageLimit === '' || promo.usageLimit === null || promo.usageLimit === undefined
    ? null
    : Number(promo.usageLimit);
  if (usageLimit !== null && Number(promo.usageCount || 0) >= usageLimit) {
    return { valid: false, error: 'Usage limit reached' };
  }

  const amount = Number(subtotal);
  if (!Number.isFinite(amount) || amount <= 0) return { valid: false, error: 'Enter valid booking dates first' };
  if (amount < Number(promo.minimumSpend || 0)) {
    return { valid: false, error: `Minimum spend is ₱${Number(promo.minimumSpend).toLocaleString()}` };
  }

  const value = Number(promo.discountValue);
  if (!Number.isFinite(value) || value <= 0) return { valid: false, error: 'Promo code has an invalid discount' };
  if (promo.discountType === 'percentage' && value > 100) {
    return { valid: false, error: 'Promo code has an invalid discount' };
  }
  if (!['percentage', 'fixed'].includes(promo.discountType)) {
    return { valid: false, error: 'Promo code has an invalid discount' };
  }

  const rawDiscount = promo.discountType === 'percentage' ? amount * value / 100 : value;
  const discountAmount = Math.min(amount, Math.round(rawDiscount * 100) / 100);
  return {
    valid: true,
    code: normalizePromoCode(promo.code),
    discountAmount,
    totalAmount: Math.max(0, Math.round((amount - discountAmount) * 100) / 100),
    discountLabel: promo.discountType === 'percentage' ? `${value}% off` : `₱${value.toLocaleString()} off`,
  };
}
