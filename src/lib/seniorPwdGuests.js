// Senior citizens and PWDs in a booking.
//
// Guests say online how many senior citizens (60+) and persons with
// disability are in their group (reservation.seniorPwdDeclared). The 20%
// discount and VAT exemption are not taken off online: staff check each ID
// at the front desk and apply it in Billing or Walk-in, which saves it in
// reservation.discounts ({ kind: 'senior' | 'pwd', ... }).

// Cleans the guest's answer. Returns { value: { senior, pwd } } or { error }.
export function normalizeSeniorPwdDeclared(input, totalGuests) {
  const senior = input?.senior === '' || input?.senior === undefined || input?.senior === null ? 0 : Number(input.senior);
  const pwd = input?.pwd === '' || input?.pwd === undefined || input?.pwd === null ? 0 : Number(input.pwd);
  if (![senior, pwd].every(n => Number.isInteger(n) && n >= 0)) return { error: 'Enter the number of senior citizens and PWDs as whole numbers.' };
  if (senior + pwd > Math.max(0, Number(totalGuests) || 0)) {
    return { error: `Your group has ${totalGuests} guest${totalGuests === 1 ? '' : 's'}, so there can't be more senior citizens and PWDs than that.` };
  }
  return { value: { senior, pwd } };
}

const countKind = (list, kind) => (Array.isArray(list) ? list.filter(item => item?.kind === kind).length : 0);
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

// What staff need to know, or null when the booking has no senior or PWD guests.
export function seniorPwdSummary(reservation = {}) {
  const declaredSenior = Number(reservation.seniorPwdDeclared?.senior || 0);
  const declaredPwd = Number(reservation.seniorPwdDeclared?.pwd || 0);
  const appliedSenior = countKind(reservation.discounts, 'senior');
  const appliedPwd = countKind(reservation.discounts, 'pwd');
  const senior = Math.max(declaredSenior, appliedSenior);
  const pwd = Math.max(declaredPwd, appliedPwd);
  if (!senior && !pwd) return null;
  const toCheck = Math.max(0, declaredSenior - appliedSenior) + Math.max(0, declaredPwd - appliedPwd);
  const who = [senior ? plural(senior, 'senior citizen', 'senior citizens') : '', pwd ? plural(pwd, 'PWD', 'PWDs') : ''].filter(Boolean).join(', ');
  const applied = appliedSenior + appliedPwd;
  return {
    senior, pwd, applied, toCheck,
    text: reservation.discountReview?.status === 'pending'
      ? `${who} · ID waiting for staff review`
      : reservation.discountReview?.status === 'uploading'
        ? `${who} · ID upload not finished`
        : toCheck > 0
      ? `${who} · check ID${toCheck === 1 ? '' : 's'} and apply the discount`
      : `${who} · discount applied`,
  };
}
