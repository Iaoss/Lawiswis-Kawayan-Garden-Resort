export function getDepositPercentage(totalAmount) {
  if (totalAmount < 5000) return 100;
  if (totalAmount <= 20000) return 50;
  return 25;
}

export function getOnlinePaymentAmount(totalAmount, choice) {
  if (!Number.isFinite(totalAmount) || totalAmount <= 0) {
    throw new Error('Reservation total must be a positive amount.');
  }
  if (!['full', 'deposit'].includes(choice)) {
    throw new Error('Choose full payment or the required deposit.');
  }

  const percentage = choice === 'full'
    ? 100
    : totalAmount < 5000 ? 50 : getDepositPercentage(totalAmount);

  return Math.round(totalAmount * percentage) / 100;
}