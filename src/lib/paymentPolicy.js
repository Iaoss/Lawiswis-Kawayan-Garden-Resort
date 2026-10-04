export function getDepositPercentage(totalAmount) {
  if (!Number.isFinite(totalAmount) || totalAmount <= 0) return 25;
  return 25;
}

export function getOnlinePaymentAmount(totalAmount, choice) {
  if (!Number.isFinite(totalAmount) || totalAmount <= 0) {
    throw new Error('Reservation total must be a positive amount.');
  }
  if (!['full', 'deposit'].includes(choice)) {
    throw new Error('Choose full payment or the required deposit.');
  }

  const percentage = choice === 'full' ? 100 : getDepositPercentage(totalAmount);

  return Math.round(totalAmount * percentage) / 100;
}