// lib/email.js
//
// Sends transactional emails via Gmail SMTP (using an App Password).
// Required environment variables: GMAIL_USER and GMAIL_APP_PASSWORD.

import nodemailer from 'nodemailer';
import { getReceiptLineItems } from '../src/lib/receiptItems';
import { getVatBreakdown } from '../src/lib/bookingPricing';
import QRCode from 'qrcode';
import {
  RESORT, button, detailsTable, escapeHtml, heading, list, longDate, notice, paragraph, peso as formalPeso, renderEmail, small,
} from './emailLayout';

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
});

const FROM_ADDRESS = `Lawiswis Kawayan Resort <${process.env.GMAIL_USER}>`;

function moneyRow(label, value, bold = false) {
  return `
    <tr>
      <td style="color:#6b7280; padding:6px 0;">${label}</td>
      <td style="text-align:right; padding:6px 0; ${bold ? 'font-weight:700; border-top:1px solid #eee;' : ''}">${value}</td>
    </tr>`;
}

const toGuest = reservation => reservation.email || reservation.guestEmail;
const firstNameOf = reservation => reservation.guestName || 'Guest';
const myBookingsUrl = bookingRef => `${RESORT.site}/my-bookings?ref=${encodeURIComponent(bookingRef)}`;
const stayDates = reservation => (reservation.checkOut && reservation.checkOut !== reservation.checkIn
  ? `${longDate(reservation.checkIn)} to ${longDate(reservation.checkOut)}`
  : longDate(reservation.checkIn));
const roomLabelOf = reservation => (reservation.type === 'corporate'
  ? `${reservation.packageName || 'Group package'} · ${Number(reservation.totalGuests || 0)} guests`
  : reservation.cottageOnly
    ? `Cottage · ${reservation.tourPeriod === 'night' ? 'Night tour' : 'Day tour'}`
    : reservation.roomName || `Room ${reservation.roomNumber || ''}${reservation.roomType ? ` (${reservation.roomType})` : ''}`);
const PAY_AT_RESORT = 'Payments at the resort are accepted in <strong>cash</strong> or by <strong>QR (GCash / QR Ph)</strong>. Credit and debit cards cannot be used on-site.';

// Day tours are billed per day; overnight stays per night.
const stayUnitLabel = (reservation, count) => `${count} ${reservation?.bookingType === 'daytour' ? 'day' : 'night'}${count === 1 ? '' : 's'}`;

export async function sendReservationConfirmationEmail(reservation, bookingRef) {
  const nights = Number(reservation.nights) || Math.max(1, Math.ceil((new Date(reservation.checkOut) - new Date(reservation.checkIn)) / 86400000));
  const html = renderEmail({
    title: 'Reservation Confirmation',
    preheader: `Your reservation #${bookingRef} is confirmed.`,
    guestName: firstNameOf(reservation),
    body: [
      paragraph(`We are pleased to confirm your reservation at ${RESORT.name}. Please find the details of your booking below.`),
      detailsTable([
        ['Booking reference', `#${escapeHtml(bookingRef)}`, { strong: true }],
        ['Guest name', escapeHtml(firstNameOf(reservation))],
        ['Accommodation', escapeHtml(roomLabelOf(reservation))],
        ['Check-in', `${escapeHtml(longDate(reservation.checkIn))}${reservation.checkInTime ? `, ${escapeHtml(reservation.checkInTime)}` : ''}`],
        ['Check-out', `${escapeHtml(longDate(reservation.checkOut))}${reservation.checkOutTime ? `, ${escapeHtml(reservation.checkOutTime)}` : ''}`],
        ['Length of stay', stayUnitLabel(reservation, nights)],
      ], 'Reservation details'),
      heading('Before you arrive'),
      list([
        'Please present a valid government-issued photo ID and your booking reference at the front desk.',
        PAY_AT_RESORT,
        `Should you need to adjust your arrival time, kindly contact us at ${RESORT.phone}.`,
      ]),
      paragraph('We look forward to welcoming you.'),
    ].join(''),
  });
  return transporter.sendMail({ from: FROM_ADDRESS, to: toGuest(reservation), subject: `Reservation Confirmed — Booking #${bookingRef}`, html });
}

export async function sendPaymentReceiptEmail(reservation, payment, receiptNumber, balanceRemaining) {
  const rawGuestName = reservation.guestName || 'Guest';
  const guestName = escapeHtml(rawGuestName);
  const paymentDate = payment.createdAt?.toDate
    ? payment.createdAt.toDate().toLocaleString()
    : new Date().toLocaleString();
  const roomLabel = reservation.type === 'corporate'
    ? `${reservation.packageName || 'Group package'} · ${Number(reservation.totalGuests || 0)} guests`
    : reservation.roomName || `Room ${reservation.roomNumber || ''} (${reservation.roomType || ''})`;
  const nights = Number(reservation.nights) || 1;
  // Itemized: what was booked, then every service and charge added later.
  const items = getReceiptLineItems(reservation);
  const taxes = Number(reservation.taxAmount || 0);
  const total = items.grandTotal + taxes;
  const peso = value => `${value < 0 ? '−' : ''}₱${Math.abs(Number(value || 0)).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const itemRows = list => list.map(item => moneyRow(escapeHtml(item.label), peso(item.amount))).join('');
  const subject = `Official Receipt ${receiptNumber} — Booking #${reservation.id?.slice(0, 8).toUpperCase() || ""}`;
  const bookingReference = reservation.id?.slice(0, 8).toUpperCase() || '';
  const paymentAmount = Number(payment.amount || 0);
  const receiptHtml = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Payment Receipt ${escapeHtml(receiptNumber)}</title>
  <style>
    @page { size: A4; margin: 18mm; }
    * { box-sizing: border-box; }
    body { margin: 0; background: #f3f5f2; color: #1f2937; font: 14px/1.5 Arial, sans-serif; }
    .receipt { max-width: 760px; margin: 32px auto; padding: 42px; background: #fff; border: 1px solid #e5e7eb; }
    .brand { color: #1a3a1a; font-size: 13px; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; }
    h1 { margin: 28px 0 4px; color: #163c2b; font-size: 30px; }
    .muted { color: #6b7280; }
    .summary { display: flex; justify-content: space-between; gap: 20px; padding: 18px 0; margin: 18px 0; border-top: 1px solid #e5e7eb; border-bottom: 1px solid #e5e7eb; }
    .summary strong { display: block; color: #111827; margin-top: 3px; }
    h2 { margin: 26px 0 10px; color: #163c2b; font-size: 15px; }
    table { width: 100%; border-collapse: collapse; }
    td { padding: 10px 0; border-bottom: 1px solid #edf0ed; }
    td:last-child { text-align: right; color: #111827; }
    .total td { border-top: 2px solid #163c2b; font-weight: 700; }
    .paid { color: #166534 !important; }
    footer { margin-top: 32px; padding-top: 14px; border-top: 1px solid #e5e7eb; color: #6b7280; font-size: 11px; }
    @media print { body { background: #fff; } .receipt { max-width: none; margin: 0; padding: 0; border: 0; } }
  </style>
</head>
<body>
  <main class="receipt">
    <div class="brand">Lawiswis Kawayan Garden Resort</div>
    <h1>Payment receipt</h1>
    <div class="muted">Thank you for your payment. Keep this receipt for your records.</div>
    <section class="summary">
      <div><span class="muted">Receipt number</span><strong>${escapeHtml(receiptNumber)}</strong></div>
      <div><span class="muted">Date issued</span><strong>${escapeHtml(paymentDate)}</strong></div>
      <div><span class="muted">Status</span><strong class="paid">Payment received</strong></div>
    </section>
    <h2>Guest and reservation</h2>
    <table>
      ${moneyRow('Guest', guestName)}
      ${moneyRow('Booking reference', `#${escapeHtml(bookingReference)}`)}
      ${moneyRow(reservation.cottageOnly ? 'Cottage' : 'Room', escapeHtml(roomLabel))}
      ${moneyRow('Check-in', escapeHtml(reservation.checkIn || '—'))}
      ${moneyRow('Check-out', escapeHtml(reservation.checkOut || '—'))}
      ${moneyRow('Stay duration', stayUnitLabel(reservation, nights))}
    </table>
    <h2>Booking</h2>
    <table>
      ${itemRows(items.booking)}
    </table>
    ${items.extras.length ? `
    <h2>Services and add-ons</h2>
    <table>
      ${itemRows(items.extras)}
      ${moneyRow('Services and add-ons total', peso(items.extrasTotal))}
    </table>` : ''}
    <h2>Payment</h2>
    <table>
      ${taxes > 0 ? moneyRow('Taxes', peso(taxes)) : ''}
      ${moneyRow('Total charges (VAT included)', peso(total))}
      ${moneyRow('Net of VAT', peso(getVatBreakdown(total).net))}
      ${moneyRow('12% VAT', peso(getVatBreakdown(total).vat))}
      ${moneyRow('Payment method', escapeHtml(payment.method || 'Not specified'))}
      ${payment.officialReceiptNo ? moneyRow('Paper receipt no.', escapeHtml(payment.officialReceiptNo)) : ''}
      ${moneyRow('Amount received', peso(paymentAmount), true)}
      ${moneyRow('Remaining balance', peso(Math.max(0, balanceRemaining)))}
    </table>
    <footer>This electronic receipt was issued by Lawiswis Kawayan Garden Resort. For assistance, contact the resort and provide receipt ${escapeHtml(receiptNumber)}.</footer>
  </main>
</body>
</html>`;
  return transporter.sendMail({
    from: FROM_ADDRESS,
    to: reservation.email || reservation.guestEmail,
    subject,
    text: `Dear ${rawGuestName},\n\nWe received your payment of ₱${paymentAmount.toLocaleString()} for booking #${bookingReference}.\nYour electronic receipt ${receiptNumber} is attached as an HTML document.`,
    html: renderEmail({
      title: 'Official Payment Receipt',
      preheader: `We received your payment of ${formalPeso(paymentAmount)}.`,
      guestName: rawGuestName,
      body: [
        paragraph('Thank you. We acknowledge receipt of your payment. A summary is provided below, and your electronic receipt is attached to this email for your records.'),
        detailsTable([
          ['Receipt number', escapeHtml(receiptNumber), { strong: true }],
          ['Booking reference', `#${escapeHtml(bookingReference)}`],
          ['Date of payment', escapeHtml(paymentDate)],
          ['Payment method', escapeHtml(payment.method || 'Not specified')],
          ['Amount received', formalPeso(paymentAmount), { strong: true }],
          ['Remaining balance', formalPeso(Math.max(0, balanceRemaining))],
        ], 'Payment summary'),
        Math.max(0, balanceRemaining) > 0
          ? notice(`A balance of <strong>${formalPeso(balanceRemaining)}</strong> remains on your booking and may be settled upon arrival. ${PAY_AT_RESORT}`)
          : notice('Your booking is fully paid. No further payment is required.', 'success'),
      ].join(''),
    }),
    attachments: [{
      filename: `${receiptNumber}.html`,
      content: receiptHtml,
      contentType: 'text/html',
    }],
  });
}

// Sent when staff cancel a booking: what was cancelled, the fee under the
// cancellation policy and the refund, with a cancellation receipt attached.
export async function sendCancellationEmail({ reservation, bookingRef, receiptNumber, outcome, reason = '', cancelledAt = new Date() }) {
  const to = reservation.email || reservation.guestEmail;
  if (!to) throw new Error('Guest email address is missing');
  const rawGuestName = reservation.guestName || 'Guest';
  const guestName = escapeHtml(rawGuestName);
  const peso = value => `₱${Number(value || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const stayLabel = reservation.type === 'corporate'
    ? `${reservation.packageName || 'Group package'} · ${Number(reservation.totalGuests || 0)} guests`
    : reservation.cottageOnly
      ? `Cottage · ${reservation.tourPeriod === 'night' ? 'Night tour' : 'Day tour'}`
      : reservation.roomName || `Room ${reservation.roomNumber || ''}${reservation.roomType ? ` (${reservation.roomType})` : ''}`;
  const dates = reservation.checkOut && reservation.checkOut !== reservation.checkIn
    ? `${reservation.checkIn} to ${reservation.checkOut}` : reservation.checkIn || '—';
  const issued = cancelledAt.toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Manila' });
  const feeLabel = outcome.rate === 0 ? 'Cancellation fee (none)' : `Cancellation fee (${outcome.rate}% of the booking)`;
  const refundNote = outcome.refund > 0
    ? `A refund of <strong>${peso(outcome.refund)}</strong> is due to you. The resort will contact you to arrange it, or reply to this email to tell us how you'd like to receive it.`
    : outcome.amountPaid > 0
      ? 'Under the cancellation policy, the amount you paid covers the cancellation fee, so no refund is due.'
      : 'No payment was made on this booking, so there is nothing to refund and nothing more to pay.';
  const refundText = outcome.refund > 0
    ? `A refund of ${peso(outcome.refund)} is due to you. The resort will contact you to arrange it.`
    : 'No refund is due under the cancellation policy.';
  const rows = [
    moneyRow('Booking total', peso(outcome.totalAmount)),
    moneyRow('Amount you paid', peso(outcome.amountPaid)),
    moneyRow(`${feeLabel} · ${escapeHtml(outcome.tier)}`, peso(outcome.fee)),
    moneyRow('Kept by the resort', peso(outcome.retained)),
    moneyRow('Refund due to you', peso(outcome.refund), true),
  ].join('');
  const policyNote = 'Cancellation policy: no fee 30 days or more before arrival, 50% of the booking less than 30 days before, and the full amount less than 7 days before, on the arrival date or for a no-show.';
  const receiptHtml = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Cancellation Receipt ${escapeHtml(receiptNumber)}</title>
  <style>
    @page { size: A4; margin: 18mm; }
    body { margin: 0; background: #f3f5f2; color: #1f2937; font: 14px/1.5 Arial, sans-serif; }
    .receipt { max-width: 760px; margin: 32px auto; padding: 42px; background: #fff; border: 1px solid #e5e7eb; }
    .brand { color: #1a3a1a; font-size: 13px; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; }
    h1 { margin: 28px 0 4px; color: #991b1b; font-size: 28px; }
    h2 { margin: 26px 0 10px; color: #163c2b; font-size: 15px; }
    .muted { color: #6b7280; }
    table { width: 100%; border-collapse: collapse; }
    td { padding: 9px 0; border-bottom: 1px solid #edf0ed; }
    td:last-child { text-align: right; }
    footer { margin-top: 32px; padding-top: 14px; border-top: 1px solid #e5e7eb; color: #6b7280; font-size: 11px; }
    @media print { body { background: #fff; } .receipt { margin: 0; padding: 0; border: 0; } }
  </style>
</head>
<body>
  <main class="receipt">
    <div class="brand">Lawiswis Kawayan Garden Resort</div>
    <h1>Cancellation receipt</h1>
    <div class="muted">Receipt ${escapeHtml(receiptNumber)} · Issued ${escapeHtml(issued)}</div>
    <h2>Cancelled booking</h2>
    <table>
      ${moneyRow('Guest', guestName)}
      ${moneyRow('Booking reference', `#${escapeHtml(bookingRef)}`)}
      ${moneyRow('Booked', escapeHtml(stayLabel))}
      ${moneyRow('Dates', escapeHtml(dates))}
      ${moneyRow('Days before arrival', escapeHtml(String(Math.max(0, outcome.daysBeforeCheckIn))))}
      ${reason ? moneyRow('Reason', escapeHtml(reason)) : ''}
    </table>
    <h2>Fee and refund</h2>
    <table>${rows}</table>
    <footer>${escapeHtml(policyNote)} For questions, contact the resort and give receipt ${escapeHtml(receiptNumber)}.</footer>
  </main>
</body>
</html>`;
  const html = renderEmail({
    title: 'Notice of Booking Cancellation',
    preheader: `Booking #${bookingRef} has been cancelled.`,
    guestName: rawGuestName,
    body: [
      paragraph(`This is to inform you that your booking <strong>#${escapeHtml(bookingRef)}</strong> for <strong>${escapeHtml(stayLabel)}</strong> has been cancelled as of ${escapeHtml(issued)}.`),
      detailsTable([
        ['Booking reference', `#${escapeHtml(bookingRef)}`, { strong: true }],
        ['Booked', escapeHtml(stayLabel)],
        ['Dates', escapeHtml(stayDates(reservation))],
        reason ? ['Reason', escapeHtml(reason)] : null,
      ], 'Cancelled booking'),
      detailsTable([
        ['Booking total', formalPeso(outcome.totalAmount)],
        ['Amount paid', formalPeso(outcome.amountPaid)],
        [`${feeLabel}<br><span style="font-size:11px;">${escapeHtml(outcome.tier)}</span>`, formalPeso(outcome.fee)],
        ['Retained by the resort', formalPeso(outcome.retained)],
        ['Refund due to you', formalPeso(outcome.refund), { strong: true }],
      ], 'Fees and refund'),
      notice(refundNote, outcome.refund > 0 ? 'success' : 'info'),
      small(escapeHtml(policyNote)),
      small(`Your cancellation receipt (${escapeHtml(receiptNumber)}) is attached to this email.`),
    ].join(''),
  });
  return transporter.sendMail({
    from: FROM_ADDRESS,
    to,
    subject: `Booking Cancelled — Booking #${bookingRef}`,
    text: `Dear ${rawGuestName},\n\nYour booking #${bookingRef} (${dates}) was cancelled on ${issued}.${reason ? `\nReason: ${reason}` : ''}\n\nBooking total: ${peso(outcome.totalAmount)}\nAmount paid: ${peso(outcome.amountPaid)}\nCancellation fee: ${peso(outcome.fee)}\nRefund due: ${peso(outcome.refund)}\n\n${refundText}\nYour cancellation receipt ${receiptNumber} is attached.`,
    html,
    attachments: [{ filename: `${receiptNumber}.html`, content: receiptHtml, contentType: 'text/html' }],
  });
}

export async function sendReservationPendingEmail(reservation, bookingRef) {
  const { email, roomNumber, roomType, checkIn, checkOut, totalAmount, nights, paymentMethod, stayLabel } = reservation;
  const vat = getVatBreakdown(totalAmount);
  const statusNote = paymentMethod === 'cash'
    ? 'Your reservation is <strong>pending confirmation</strong> by our front office. Kindly prepare the total amount upon arrival; we will contact you shortly to confirm your stay.'
    : 'Your reservation is <strong>awaiting payment</strong>. If you have not yet completed your payment, please return to the booking page to finish the checkout.';
  const html = renderEmail({
    title: 'Reservation Request Received',
    preheader: `We have received your reservation request #${bookingRef}.`,
    guestName: firstNameOf(reservation),
    body: [
      paragraph(`Thank you for choosing ${RESORT.name}. We have received your reservation request for <strong>${escapeHtml(stayLabel || `Room ${roomNumber} (${roomType})`)}</strong>.`),
      detailsTable([
        ['Booking reference', `#${escapeHtml(bookingRef)}`, { strong: true }],
        ['Check-in', escapeHtml(longDate(checkIn))],
        ['Check-out', escapeHtml(longDate(checkOut))],
        stayLabel ? null : ['Nights', escapeHtml(nights)],
        ['Total (VAT inclusive)', formalPeso(totalAmount), { strong: true }],
        ['Net of VAT', formalPeso(vat.net)],
        ['12% VAT', formalPeso(vat.vat)],
      ], 'Reservation details'),
      notice(statusNote),
      paragraph('Your official confirmation will be sent to this email address once your reservation is confirmed.'),
    ].join(''),
  });
  return transporter.sendMail({ from: FROM_ADDRESS, to: email, subject: `Reservation Request Received — Booking #${bookingRef}`, html });
}

export async function sendRefundDecisionEmail({
  reservation,
  bookingRef,
  outcome,
  reason,
  alternatives = [],
  amount = 0,
  processorReference = '',
  timeline = 'Refund timing depends on the original payment method and payment processor confirmation.',
}) {
  const heading_ = outcome === 'eligible'
    ? 'Your refund request was approved'
    : outcome === 'approved'
      ? 'Your refund is being processed'
    : outcome === 'rejected'
      ? 'Your refund request was not approved'
    : outcome === 'not_eligible'
      ? 'An update on your refund request'
      : outcome === 'refunded'
        ? 'Your refund has been confirmed'
        : outcome === 'failed'
          ? 'Your refund needs further review'
          : 'Your refund request is under review';
  const tone = ['eligible', 'approved', 'refunded'].includes(outcome) ? 'success' : ['rejected', 'failed'].includes(outcome) ? 'warning' : 'info';
  const html = renderEmail({
    title: 'Refund Request Update',
    preheader: `${heading_} (booking #${bookingRef}).`,
    guestName: firstNameOf(reservation),
    body: [
      paragraph(`We are writing regarding the refund request for your booking <strong>#${escapeHtml(bookingRef)}</strong>.`),
      notice(`<strong>${escapeHtml(heading_)}.</strong><br>${escapeHtml(reason || 'The resort has reviewed your refund request.')}`, tone),
      detailsTable([
        ['Booking reference', `#${escapeHtml(bookingRef)}`, { strong: true }],
        amount > 0 ? ['Refund amount', formalPeso(amount), { strong: true }] : null,
        processorReference ? ['Processor reference', escapeHtml(processorReference)] : null,
      ]),
      paragraph(escapeHtml(timeline)),
      alternatives.length ? heading('Other options available to you') + list(alternatives.map(item => escapeHtml(item))) : '',
      paragraph('Should you have any questions, please reply to this email or contact our front office.'),
    ].join(''),
  });
  return transporter.sendMail({ from: FROM_ADDRESS, to: toGuest(reservation), subject: `Refund Request Update — Booking #${bookingRef}`, html });
}

export async function sendScheduleChangeEmail({ reservation, bookingRef, change, paymentUrl = '' }) {
  const guestName = escapeHtml(reservation.guestName || 'Guest');
  const status = change.status === 'rejected'
    ? 'Your schedule change request was not approved.'
    : change.status === 'needs_review'
      ? 'Your schedule change request needs manual review.'
      : change.status === 'requested'
        ? 'Your schedule change request was received and is awaiting staff review.'
        : change.status === 'awaiting_payment'
          ? 'Your schedule change is approved, pending the required payment.'
          : change.status === 'awaiting_refund'
            ? 'Your schedule change is approved, pending refund confirmation.'
      : change.status === 'completed'
        ? 'Your reservation dates have been updated.'
        : 'Your schedule change request was approved.';
  const subject = `Booking Date Change — Booking #${bookingRef}`;
  const tone = change.status === 'rejected' ? 'warning' : ['completed', 'approved'].includes(change.status) ? 'success' : 'info';
  const suggestions = Array.isArray(change.suggestions) ? change.suggestions : [];
  const html = renderEmail({
    title: 'Booking Date Change',
    preheader: `${status} (booking #${bookingRef})`,
    guestName: firstNameOf(reservation),
    body: [
      paragraph(`We are writing regarding the date change request for your booking <strong>#${escapeHtml(bookingRef)}</strong>.`),
      notice(`<strong>${escapeHtml(status)}</strong>${change.reason ? `<br>${escapeHtml(change.reason)}` : ''}${change.staffReason && change.staffReason !== change.reason ? `<br>${escapeHtml(change.staffReason)}` : ''}`, tone),
      detailsTable([
        ['Booking reference', `#${escapeHtml(bookingRef)}`, { strong: true }],
        ['Check-in', escapeHtml(longDate(change.checkIn || reservation.checkIn))],
        ['Check-out', escapeHtml(longDate(change.checkOut || reservation.checkOut))],
        ['Updated booking total', formalPeso(change.updatedTotal || reservation.totalAmount || 0)],
        change.cancellationFee > 0 ? ['Shortened-stay cancellation fee', formalPeso(change.cancellationFee)] : null,
        change.refundDue > 0 ? ['Refund pending confirmation', formalPeso(change.refundDue), { strong: true }] : null,
        paymentUrl ? ['Required deposit', formalPeso(change.paymentDue || 0), { strong: true }] : null,
      ], change.status === 'rejected' ? 'Your current booking' : 'Updated booking'),
      paymentUrl ? `<p style="margin:0 0 16px;">${button(paymentUrl, `Pay the deposit of ${formalPeso(change.paymentDue || 0)}`)}</p>` : '',
      suggestions.length ? [
        heading('Available dates at the same price'),
        paragraph('The following dates are available for the same room at the same price:'),
        list(suggestions.map(item => escapeHtml(item.checkOut && item.checkOut !== item.checkIn ? `${longDate(item.checkIn)} to ${longDate(item.checkOut)}` : longDate(item.checkIn)))),
        `<p style="margin:0 0 16px;">${button(myBookingsUrl(bookingRef), 'Request one of these dates')}</p>`,
      ].join('') : '',
      ['approved', 'completed'].includes(change.status)
        ? small('Your updated booking receipt is attached to this email.')
        : small('An updated booking receipt will be sent once any required payment or refund is confirmed.'),
    ].join(''),
  });
  const receiptHtml = `<!doctype html><html><head><meta charset="utf-8"><title>Updated booking receipt</title></head>
    <body style="font-family:Arial,sans-serif;color:#1f2937;padding:24px">
      <h1 style="color:#1a3a1a">Updated booking receipt</h1>
      <p>Lawiswis Kawayan Garden Resort · Booking #${escapeHtml(bookingRef)}</p>
      <p>Guest: ${guestName}</p>
      <p>Stay: ${escapeHtml(change.checkIn || reservation.checkIn)} – ${escapeHtml(change.checkOut || reservation.checkOut)}</p>
      <p>Updated total: ₱${Number(change.updatedTotal || reservation.totalAmount || 0).toLocaleString()}</p>
      <p>Amount paid: ₱${Number(reservation.amountPaid || 0).toLocaleString()}</p>
      <p>Reservation status: ${escapeHtml(reservation.status || 'confirmed')}</p>
    </body></html>`;
  const attachments = ['approved', 'completed'].includes(change.status)
    ? [{
      filename: `booking-${bookingRef}-updated.html`,
      content: receiptHtml,
      contentType: 'text/html',
    }]
    : [];
  return transporter.sendMail({
    from: FROM_ADDRESS,
    to: reservation.email || reservation.guestEmail,
    subject,
    html,
    attachments,
  });
}

export async function sendArrivalReminderEmail(reservation, bookingRef) {
  const checkInTime = reservation.checkInTime || '2:00 PM';
  const html = renderEmail({
    title: 'Arrival Reminder',
    preheader: `Your stay begins tomorrow, ${longDate(reservation.checkIn)}.`,
    guestName: firstNameOf(reservation),
    body: [
      paragraph(`This is a courtesy reminder that your stay at ${RESORT.name} begins <strong>tomorrow</strong>. We look forward to welcoming you.`),
      detailsTable([
        ['Booking reference', `#${escapeHtml(bookingRef)}`, { strong: true }],
        ['Accommodation', escapeHtml(roomLabelOf(reservation))],
        ['Check-in', `${escapeHtml(longDate(reservation.checkIn))}, ${escapeHtml(checkInTime)}`],
        ['Check-out', `${escapeHtml(longDate(reservation.checkOut))}${reservation.checkOutTime ? `, ${escapeHtml(reservation.checkOutTime)}` : ''}`],
      ], 'Your stay'),
      heading('Resort guidelines'),
      list([
        'Please bring a valid government-issued photo ID and your booking reference.',
        `Any remaining balance may be settled at the front desk. ${PAY_AT_RESORT}`,
        'Kindly observe quiet hours and help us keep the resort grounds clean.',
        `If you expect to arrive late, please inform the front desk at ${RESORT.phone} so that we can hold your reservation.`,
      ]),
      paragraph(`<strong>Address:</strong> ${RESORT.address}`),
    ].join(''),
  });
  return transporter.sendMail({ from: FROM_ADDRESS, to: toGuest(reservation), subject: `Arrival Reminder: Your Stay Begins Tomorrow — Booking #${bookingRef}`, html });
}

export async function sendThankYouEmail(reservation, bookingRef, feedbackUrl) {
  const safeUrl = escapeHtml(feedbackUrl);
  // The QR picture is attached to the email itself. Outlook and Gmail block
  // pictures loaded from other websites (always in the Junk folder).
  let qrPng = null;
  try {
    qrPng = await QRCode.toBuffer(feedbackUrl, { type: 'png', width: 360, margin: 1, errorCorrectionLevel: 'M' });
  } catch (qrError) {
    console.error('Feedback QR code could not be made:', qrError);
  }
  const html = renderEmail({
    title: 'Thank You for Staying With Us',
    preheader: 'We would appreciate your feedback on your recent stay.',
    guestName: firstNameOf(reservation),
    body: [
      paragraph(`Thank you for choosing ${RESORT.name} (booking #${escapeHtml(bookingRef)}). It was our pleasure to have you as our guest.`),
      paragraph('We would be grateful if you could take a minute to share your feedback. Your comments help us improve our service.'),
      `<p style="margin:6px 0 16px;text-align:center;">${button(feedbackUrl, 'Share your feedback')}</p>`,
      qrPng ? '<p style="text-align:center;margin:0 0 6px;"><img src="cid:feedback-qr" alt="QR code for the feedback form" width="170" height="170" style="display:inline-block;"></p><p style="text-align:center;margin:0 0 16px;font-size:12px;color:#6b7280;">Or scan this QR code with your phone camera.</p>' : '',
      small(`If the button does not work, copy this link into your browser:<br><a href="${safeUrl}" style="color:#1a3a1a;word-break:break-all;">${safeUrl}</a>`),
      paragraph('We look forward to welcoming you again.'),
    ].join(''),
  });
  return transporter.sendMail({ from: FROM_ADDRESS, to: reservation.email || reservation.guestEmail, subject: `Thank You for Staying With Us — Booking #${bookingRef}`,
    html,
    attachments: qrPng ? [{ filename: 'feedback-qr.png', content: qrPng, contentType: 'image/png', cid: 'feedback-qr' }] : [],
  });
}

export async function sendPaymentConfirmedEmail(reservation, bookingRef) {
  const { email, checkIn, checkOut, totalAmount, nights, amountPaid, paymentStatus } = reservation;
  const isFullyPaid = paymentStatus === 'paid';
  const balance = Math.max(0, Number(totalAmount || 0) - Number(amountPaid || 0));
  const html = renderEmail({
    title: isFullyPaid ? 'Reservation Confirmed' : 'Payment Received',
    preheader: isFullyPaid ? `Booking #${bookingRef} is confirmed and fully paid.` : `We received your payment for booking #${bookingRef}.`,
    guestName: firstNameOf(reservation),
    body: [
      paragraph(isFullyPaid
        ? `Thank you for your payment. Your reservation for <strong>${escapeHtml(roomLabelOf(reservation))}</strong> is now confirmed.`
        : `Thank you for your payment. It has been recorded on your reservation for <strong>${escapeHtml(roomLabelOf(reservation))}</strong>.`),
      detailsTable([
        ['Booking reference', `#${escapeHtml(bookingRef)}`, { strong: true }],
        ['Check-in', escapeHtml(longDate(checkIn))],
        ['Check-out', escapeHtml(longDate(checkOut))],
        nights ? ['Length of stay', stayUnitLabel(reservation, Number(nights))] : null,
        ['Amount paid', formalPeso(amountPaid || totalAmount), { strong: true }],
        isFullyPaid ? null : ['Booking total', formalPeso(totalAmount)],
        isFullyPaid ? null : ['Remaining balance', formalPeso(balance)],
      ], 'Payment details'),
      isFullyPaid ? notice('Your booking is fully paid.', 'success') : notice(`The remaining balance of <strong>${formalPeso(balance)}</strong> may be settled upon arrival. ${PAY_AT_RESORT}`),
      paragraph('We look forward to welcoming you.'),
    ].join(''),
  });
  return transporter.sendMail({ from: FROM_ADDRESS, to: email, subject: `${isFullyPaid ? 'Reservation Confirmed' : 'Payment Received'} — Booking #${bookingRef}`, html });
}

// Sent by staff when an online booking came in without payment: asks the
// guest to confirm the booking is really theirs before staff hold the room.
export async function sendBookingCheckEmail({ reservation, bookingRef, yesUrl, noUrl }) {
  const html = renderEmail({
    title: 'Please Confirm Your Reservation',
    preheader: `Did you make booking #${bookingRef}?`,
    guestName: firstNameOf(reservation),
    body: [
      paragraph('We received an online reservation under your name and email address, but we have not yet received a payment. Before we hold the room, kindly confirm whether this reservation is yours.'),
      detailsTable([
        ['Booking reference', `#${escapeHtml(bookingRef)}`, { strong: true }],
        ['Accommodation', escapeHtml(roomLabelOf(reservation))],
        ['Check-in', escapeHtml(longDate(reservation.checkIn))],
        ['Check-out', escapeHtml(longDate(reservation.checkOut))],
        ['Booking total', formalPeso(reservation.totalAmount), { strong: true }],
      ], 'Reservation details'),
      `<p style="margin:0 0 16px;">${button(yesUrl, 'Yes, this is my reservation')}${button(noUrl, 'No, I did not make this', { secondary: true })}</p>`,
      paragraph('If you confirm, we will send you a secure payment link. Your reservation is confirmed once the payment is completed.'),
    ].join(''),
  });
  return transporter.sendMail({ from: FROM_ADDRESS, to: toGuest(reservation), subject: `Please Confirm Your Reservation — Booking #${bookingRef}`, html });
}

// Payment link (PayMongo: QR Ph, GCash, Maya, card) emailed by staff for an
// unpaid online booking. Paying at least the deposit confirms the booking.
export async function sendPaymentLinkEmail({ reservation, bookingRef, amount, choice, paymentUrl }) {
  const html = renderEmail({
    title: 'Payment Link for Your Reservation',
    preheader: `Pay ${formalPeso(amount)} to secure booking #${bookingRef}.`,
    guestName: firstNameOf(reservation),
    body: [
      paragraph(`Thank you for confirming your reservation. To secure your room, kindly settle ${choice === 'full' ? 'the full amount' : 'the deposit'} using the secure payment link below.`),
      detailsTable([
        ['Booking reference', `#${escapeHtml(bookingRef)}`, { strong: true }],
        ['Accommodation', escapeHtml(roomLabelOf(reservation))],
        ['Check-in', escapeHtml(longDate(reservation.checkIn))],
        ['Check-out', escapeHtml(longDate(reservation.checkOut))],
        ['Booking total', formalPeso(reservation.totalAmount)],
        [choice === 'full' ? 'Amount due' : 'Deposit due', formalPeso(amount), { strong: true }],
      ], 'Reservation details'),
      `<p style="margin:0 0 16px;">${button(paymentUrl, `Pay ${formalPeso(amount)} now`)}</p>`,
      paragraph('The secure PayMongo page accepts <strong>QR Ph</strong> (scan with your bank or e-wallet app), GCash, Maya and credit or debit cards. Your reservation is confirmed as soon as the payment is completed, and your receipt will be emailed to you.'),
      small(`If the button does not work, copy this link into your browser:<br>${escapeHtml(paymentUrl)}`),
    ].join(''),
  });
  return transporter.sendMail({ from: FROM_ADDRESS, to: toGuest(reservation), subject: `Payment Link for Your Reservation — Booking #${bookingRef}`, html });
}

// The resort has to close (typhoon, flood, emergency) on the guest's dates.
// Their options: move to new dates or a full refund, with no fee.
export async function sendClosureNoticeEmail({ reservation, bookingRef, reason, closedFrom, closedTo }) {
  const span = closedFrom === closedTo ? longDate(closedFrom) : `${longDate(closedFrom)} to ${longDate(closedTo)}`;
  const html = renderEmail({
    title: 'Important Notice: Resort Closure on Your Dates',
    preheader: 'Please choose new dates or a full refund, with no fee.',
    guestName: firstNameOf(reservation),
    body: [
      paragraph(`We regret to inform you that ${RESORT.name} will be closed from <strong>${escapeHtml(span)}</strong>${reason ? ` due to <strong>${escapeHtml(reason)}</strong>` : ''}. Your reservation falls within these dates.`),
      detailsTable([
        ['Booking reference', `#${escapeHtml(bookingRef)}`, { strong: true }],
        ['Accommodation', escapeHtml(roomLabelOf(reservation))],
        ['Your dates', escapeHtml(stayDates(reservation))],
        ['Amount paid', formalPeso(reservation.amountPaid)],
      ], 'Your reservation'),
      heading('Your options (no cancellation fee)'),
      list([
        '<strong>Rebook:</strong> choose a new date. Your room, number of guests, length of stay and price remain the same. If your preferred date is unavailable, we will suggest the closest available dates.',
        '<strong>Cancel:</strong> receive a full (100%) refund of the amount you paid.',
      ]),
      `<p style="margin:0 0 16px;">${button(myBookingsUrl(bookingRef), 'Rebook or cancel my reservation')}</p>`,
      small('On that page, enter the mobile number or email address you used when booking.'),
      paragraph(`You may also reply to this email, call or text us at <strong>${RESORT.phone}</strong>, or message us through the website chat with your booking reference.`),
      paragraph('We sincerely apologize for the inconvenience and thank you for your understanding.'),
    ].join(''),
  });
  return transporter.sendMail({
    from: FROM_ADDRESS,
    to: toGuest(reservation),
    subject: `Important: Resort Closure on Your Dates — Booking #${bookingRef}`,
    html,
  });
}

// Daily data backup to the resort's own inbox (see apiHandlers/arrival-reminders.js).
export async function sendBackupEmail({ filename, content, counts, dateLabel }) {
  const lines = Object.entries(counts).map(([name, count]) => `<li>${escapeHtml(name)}: ${Number(count)}</li>`).join('');
  return transporter.sendMail({
    from: FROM_ADDRESS,
    to: process.env.GMAIL_USER,
    subject: `Daily backup — ${dateLabel}`,
    html: `<div style="font-family:Arial,sans-serif;color:#1f2937"><p>Attached is the daily backup of the reservation system (${escapeHtml(dateLabel)}).</p><ul>${lines}</ul><p style="color:#6b7280;font-size:12px">It contains guest personal data. Keep this email private and don't forward it. Backups older than 30 days can be deleted.</p></div>`,
    attachments: [{ filename, content, contentType: 'application/gzip' }],
  });
}
