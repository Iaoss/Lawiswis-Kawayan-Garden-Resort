export function normalizePromoCode(code) {
  return String(code || '').trim().toUpperCase();
}

export function evaluatePromo(promo, subtotal, today = new Date().toISOString().slice(0, 10)) {
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
