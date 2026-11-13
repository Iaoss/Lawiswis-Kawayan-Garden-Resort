import { agencyDueText, agencyPaymentDue, agencyStatusLabel, canStayOnAgencyCredit, normalizeAgencyDetails, perDiemFit } from './agencyBilling';
import { getCheckInPaymentError, mustPayBeforeCheckout } from './reservationStatus';

const group = { type: 'corporate', totalAmount: 60000, amountPaid: 0, extraCharges: 0 };
const agencyNoPo = { ...group, chargeToAgency: true, agencyBilling: { poNumber: '', guestPoNumber: 'PO-1' } };
const agencyWithPo = { ...group, chargeToAgency: true, agencyBilling: { poNumber: 'PO-2026-0123' } };

describe('government agency billing', () => {
  it('cleans and checks the agency details', () => {
    expect(normalizeAgencyDetails({ office: '  DepEd   Region III ', tin: '123-456-789-000', poNumber: 'PO-2026-01', perDiemRate: '2500' }).value)
      .toEqual({ office: 'DepEd Region III', tin: '123-456-789-000', poNumber: 'PO-2026-01', perDiemRate: 2500, paymentTermsDays: 30 });
    expect(normalizeAgencyDetails({ paymentTermsDays: '45' }).value.paymentTermsDays).toBe(45);
    expect(normalizeAgencyDetails({ paymentTermsDays: 120 }).error).toMatch(/Payment terms/);
    expect(normalizeAgencyDetails({ paymentTermsDays: 2.5 }).error).toMatch(/Payment terms/);
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

  it('works out when the agency has to pay (enjoy now, pay later)', () => {
    const stay = { ...agencyWithPo, checkIn: '2026-11-01', checkOut: '2026-11-02' };
    const now = new Date('2026-11-20T04:00:00Z'); // Nov 20, noon in Manila
    expect(agencyPaymentDue(group, { now })).toBeNull();
    expect(agencyPaymentDue(stay, { now, balance: 5000 })).toMatchObject({ termsDays: 30, dueDate: '2026-12-02', daysLeft: 12, overdue: false });
    const short = { ...stay, agencyBilling: { ...stay.agencyBilling, paymentTermsDays: 7 } };
    expect(agencyPaymentDue(short, { now, balance: 5000 })).toMatchObject({ dueDate: '2026-11-09', overdue: true });
    expect(agencyDueText(agencyPaymentDue(short, { now, balance: 5000 }))).toMatch(/^Overdue by 11 days/);
    expect(agencyPaymentDue(short, { now, balance: 0 })).toMatchObject({ overdue: false, paid: true });
    expect(agencyStatusLabel(stay)).toBe('Enjoy now, pay later · PO PO-2026-0123');
  });
});
