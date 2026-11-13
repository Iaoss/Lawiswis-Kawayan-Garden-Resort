import React, { useEffect, useState } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../../firebase/firebase';
import { staffApi } from '../lib/staffApi';
import { appAlert } from '../../components/ui/app-dialog';
import { agencyDueText, agencyPaymentDue, canStayOnAgencyCredit, DEFAULT_PAYMENT_TERMS_DAYS, isAgencyBilled, MAX_PAYMENT_TERMS_DAYS, PAY_LATER_LABEL, perDiemFit } from '../../lib/agencyBilling';
import { printStatementOfAccount } from '../lib/printStatementOfAccount';

// Billing: "Enjoy now, pay later" for government agency / per diem groups.
// Staff save the agency's PO number (this confirms the booking and lets the
// group check in and out with the bill open) and print the Statement of
// Account to send to the agency.
export default function AgencyBillingCard({ reservation, balance = null, t, onSaved }) {
  const r = reservation;
  const agency = r.agencyBilling || {};
  const [form, setForm] = useState(() => fromReservation(r));
  const [busy, setBusy] = useState(false);
  const [printing, setPrinting] = useState(false);

  useEffect(() => { setForm(fromReservation(r)); }, [r.id, r.chargeToAgency, agency.poNumber, agency.tin, agency.office, agency.perDiemRate, agency.paymentTermsDays]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (key, value) => setForm(current => ({ ...current, [key]: value }));
  const save = async () => {
    setBusy(true);
    try {
      const result = await staffApi('staff-billing', {
        action: 'set-agency-billing',
        reservationId: r.id,
        chargeToAgency: form.on,
        agency: { office: form.office, tin: form.tin, poNumber: form.poNumber, perDiemRate: form.perDiemRate, paymentTermsDays: form.paymentTermsDays },
      });
      onSaved?.(result.chargeToAgency
        ? (result.poNumber ? `Saved: billed to the agency, PO ${result.poNumber}.${result.confirmed ? ' The booking is now confirmed.' : ''}` : 'Saved: billed to the agency. Add the PO number when the agency sends it.')
        : 'Agency billing turned off.');
    } catch (error) {
      appAlert(error.message, { title: 'Couldn’t save', tone: 'danger' });
    } finally {
      setBusy(false);
    }
  };

  const printSoa = async () => {
    setPrinting(true);
    try {
      const snap = await getDocs(query(collection(db, 'payments'), where('reservationId', '==', r.id)));
      const payments = snap.docs.map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0));
      if (!printStatementOfAccount(r, payments)) appAlert('Allow pop-ups for this site to print the Statement of Account.', { title: 'Pop-up blocked', tone: 'warning' });
    } catch (error) {
      appAlert(error.message || 'Payments could not be loaded.', { title: 'Couldn’t print', tone: 'danger' });
    } finally {
      setPrinting(false);
    }
  };

  const fit = perDiemFit(r.packageRate, form.perDiemRate);
  // Due date as saved on the booking (changes show after Save).
  const due = isAgencyBilled(r) ? agencyPaymentDue(r, { balance }) : null;
  const label = { display: 'grid', gap: 4, fontSize: 11, fontWeight: 600, color: t.SUBTEXT, minWidth: 0 };
  const input = { ...t.inp, width: '100%', minWidth: 0 };

  return (
    <div style={t.card}>
      <div style={{ fontWeight: 700, fontSize: 14, color: t.TEXT, marginBottom: 4 }}>
        <i className="ti ti-building-bank" aria-hidden="true" /> {PAY_LATER_LABEL} · government agency
      </div>
      <div style={{ fontSize: 11.5, color: t.SUBTEXT, marginBottom: 12 }}>
        The group stays first and the agency pays after the event (per diem, Purchase Order). With a PO saved, the group can check in and out while the agency’s payment is pending, and the agency pays within the payment terms after check-out.
      </div>
      <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, color: t.TEXT, marginBottom: 10 }}>
        <input type="checkbox" checked={form.on} onChange={e => set('on', e.target.checked)} />
        {PAY_LATER_LABEL}: charge to the agency
      </label>
      {form.on && (
        <div style={{ display: 'grid', gap: 8 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8 }}>
            <label style={label}>PO number<input value={form.poNumber} maxLength={40} onChange={e => set('poNumber', e.target.value)} placeholder="e.g. PO-2026-0123" style={input} /></label>
            <label style={label}>Agency TIN<input value={form.tin} maxLength={20} onChange={e => set('tin', e.target.value)} placeholder="123-456-789-000" style={input} /></label>
            <label style={label}>Office / unit<input value={form.office} maxLength={120} onChange={e => set('office', e.target.value)} placeholder="e.g. DepEd Region III" style={input} /></label>
            <label style={label}>Per diem (₱ per person/day)<input type="number" min="0" value={form.perDiemRate} onChange={e => set('perDiemRate', e.target.value)} style={input} /></label>
            <label style={label}>Pay within (days after check-out)<input type="number" min="0" max={MAX_PAYMENT_TERMS_DAYS} step="1" value={form.paymentTermsDays} onChange={e => set('paymentTermsDays', e.target.value)} style={input} /></label>
          </div>
          {due && <div style={{ fontSize: 11.5, fontWeight: 600, color: due.overdue ? t.RED : t.SUBTEXT }}>Agency payment: {agencyDueText(due)}{due.overdue ? '. Follow up with the agency and send the Statement of Account again.' : ''}</div>}
          {agency.guestPoNumber && !agency.poNumber && (
            <div style={{ fontSize: 11.5, color: t.SUBTEXT }}>
              The guest wrote PO <strong>{agency.guestPoNumber}</strong> on the website. Check it against the agency’s PO, then save it above.
              {!form.poNumber && <button type="button" onClick={() => set('poNumber', agency.guestPoNumber)} style={{ marginLeft: 6, border: 0, background: 'none', color: t.ACCENT_LINK, cursor: 'pointer', fontWeight: 700, padding: 0, fontFamily: 'inherit' }}>Use it</button>}
            </div>
          )}
          {fit && <div style={{ fontSize: 11.5, color: fit.fits ? t.GREEN : t.RED }}>{fit.message}</div>}
          {!form.poNumber && <div style={{ fontSize: 11.5, color: t.RED }}>No PO yet: the group can’t check in until the agency’s PO number is saved.</div>}
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
        <button type="button" onClick={save} disabled={busy} style={{ ...t.btn('primary'), opacity: busy ? 0.6 : 1 }}>{busy ? 'Saving…' : 'Save'}</button>
        {isAgencyBilled(r) && (
          <button type="button" onClick={printSoa} disabled={printing} style={t.btn()}>
            <i className="ti ti-printer" aria-hidden="true" /> {printing ? 'Opening…' : 'Print Statement of Account'}
          </button>
        )}
      </div>
      {canStayOnAgencyCredit(r) && r.status === 'checked-out' && (
        <div style={{ fontSize: 11.5, color: t.SUBTEXT, marginTop: 10 }}>
          The group has checked out. When the agency pays, record it under Take payment with the official receipt number.
        </div>
      )}
    </div>
  );
}

function fromReservation(r) {
  const agency = r.agencyBilling || {};
  return {
    on: r.chargeToAgency === true,
    poNumber: agency.poNumber || '',
    tin: agency.tin || '',
    office: agency.office || '',
    perDiemRate: agency.perDiemRate ? String(agency.perDiemRate) : '',
    paymentTermsDays: String(Number.isInteger(agency.paymentTermsDays) ? agency.paymentTermsDays : DEFAULT_PAYMENT_TERMS_DAYS),
  };
}
