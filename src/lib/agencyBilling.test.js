import { agencyStatusLabel, canStayOnAgencyCredit, normalizeAgencyDetails, perDiemFit } from './agencyBilling';
import { getCheckInPaymentError, mustPayBeforeCheckout } from './reservationStatus';

const group = { type: 'corporate', totalAmount: 60000, amountPaid: 0, extraCharges: 0 };
const agencyNoPo = { ...group, chargeToAgency: true, agencyBilling: { poNumber: '', guestPoNumber: 'PO-1' } };
const agencyWithPo = { ...group, chargeToAgency: true, agencyBilling: { poNumber: 'PO-2026-0123' } };

describe('government agency billing', () => {
  it('cleans and checks the agency details', () => {
    expect(normalizeAgencyDetails({ office: '  DepEd   Region III ', tin: '123-456-789-000', poNumber: 'PO-2026-01', perDiemRate: '2500' }).value)
      .toEqual({ office: 'DepEd Region III', tin: '123-456-789-000', poNumber: 'PO-2026-01', perDiemRate: 2500 });
    expect(normalizeAgencyDetails({ tin: '12ab' }).error).toMatch(/TIN/);
    expect(normalizeAgencyDetails({ poNumber: '<script>' }).error).toMatch(/PO number/);
    expect(normalizeAgencyDetails({ perDiemRate: -5 }).error).toMatch(/per diem/);
    expect(normalizeAgencyDetails({}, { require: ['poNumber'] }).error).toMatch(/Purchase Order/);
  });

  it('compares the package with the per diem', () => {
    expect(perDiemFit(2000, 2500)).toMatchObject({ fits: true });
    expect(perDiemFit(3000, 2500)).toMatchObject({ fits: false, difference: 500 });
    expect(perDiemFit(2000, '')).toBeNull();
  });

  it('lets a group with a staff-saved PO check in and out with the bill open', () => {
    expect(getCheckInPaymentError(group)).toMatch(/owes/);
    expect(getCheckInPaymentError(agencyNoPo)).toMatch(/Purchase Order/);
    expect(getCheckInPaymentError(agencyWithPo)).toBe('');
    expect(mustPayBeforeCheckout(group)).toBe(true);
    expect(mustPayBeforeCheckout(agencyNoPo)).toBe(true);
    expect(mustPayBeforeCheckout(agencyWithPo)).toBe(false);
    expect(canStayOnAgencyCredit(agencyNoPo)).toBe(false); // the guest's own PO doesn't count
  });

  it('labels the booking for staff', () => {
    expect(agencyStatusLabel(group)).toBe('');
    expect(agencyStatusLabel(agencyNoPo)).toMatch(/waiting for PO/);
    expect(agencyStatusLabel(agencyWithPo)).toMatch(/PO-2026-0123/);
  });
});
