// Shows peso amounts in the staff portal's chosen currency (Settings →
// Regional). Everything is stored and charged in pesos; dollars are only a
// display conversion using the exchange rate staff set there.
export const DEFAULT_USD_RATE = 58;

let current = { currency: 'PHP', usdRate: DEFAULT_USD_RATE };

export function setMoneySettings({ currency, usdRate } = {}) {
  const rate = Number(usdRate);
  current = {
    currency: currency === 'USD' ? 'USD' : 'PHP',
    usdRate: Number.isFinite(rate) && rate > 0 ? rate : DEFAULT_USD_RATE,
  };
}

export const getMoneySettings = () => current;

// money(1500) → "₱1,500" or "$25.86" (with the rate 58).
export function money(amountInPesos, { decimals } = {}) {
  const value = Number(amountInPesos) || 0;
  const sign = value < 0 ? '−' : '';
  const abs = Math.abs(value);
  if (current.currency === 'USD') {
    return `${sign}$${(abs / current.usdRate).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  const digits = decimals ?? (Number.isInteger(abs) ? 0 : 2);
  return `${sign}₱${abs.toLocaleString('en-PH', { minimumFractionDigits: digits, maximumFractionDigits: Math.max(digits, 2) })}`;
}

// Short symbol for input labels ("Amount (₱)"). Inputs stay in pesos.
export const currencySymbol = () => (current.currency === 'USD' ? '$' : '₱');
