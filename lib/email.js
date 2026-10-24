// lib/email.js
//
// Sends transactional emails via Gmail SMTP (using an App Password).
// Required environment variables: GMAIL_USER and GMAIL_APP_PASSWORD.

import nodemailer from 'nodemailer';

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

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[character]));
}

// Day tours are billed per day; overnight stays per night.
const stayUnitLabel = (reservation, count) => `${count} ${reservation?.bookingType === 'daytour' ? 'day' : 'night'}${count === 1 ? '' : 's'}`;

export async function sendReservationConfirmationEmail(reservation, bookingRef) {
  const guestName = escapeHtml(reservation.guestName || 'Guest');
  const roomName = escapeHtml(reservation.roomName || `Room ${reservation.roomNumber || ''} (${reservation.roomType || ''})`);
  const nights = Number(reservation.nights) || Math.max(1, Math.ceil((new Date(reservation.checkOut) - new Date(reservation.checkIn)) / 86400000));
  const subject = `Booking confirmed — #${bookingRef}`;
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;color:#1f2937;">
      <h2 style="color:#1a3a1a;">Your stay is confirmed, ${guestName}.</h2>
      <p>We look forward to welcoming you to <strong>${roomName}</strong>.</p>
      <table style="width:100%;font-size:14px;margin:16px 0;border-collapse:collapse;">
        ${moneyRow('Guest', guestName)}
        ${moneyRow('Room', roomName)}
        ${moneyRow('Check-in', escapeHtml(reservation.checkIn))}
        ${moneyRow('Check-out', escapeHtml(reservation.checkOut))}
        ${moneyRow('Duration', stayUnitLabel(reservation, nights))}
        ${moneyRow('Booking reference', `#${escapeHtml(bookingRef)}`, true)}
      </table>
      <h3 style="font-size:15px;color:#1a3a1a;">Check-in policies</h3>
      <p>Please bring a valid photo ID and present your booking reference at reception. Check-in and check-out times are subject to the resort's published schedule; contact the resort if you need to confirm your arrival time.</p>
    </div>`;
  return transporter.sendMail({ from: FROM_ADDRESS, to: reservation.email || reservation.guestEmail, subject, html });
}

export async function sendPaymentReceiptEmail(reservation, payment, receiptNumber, balanceRemaining) {
  const rawGuestName = reservation.guestName || 'Guest';
  const guestName = escapeHtml(rawGuestName);
  const paymentDate = payment.createdAt?.toDate
    ? payment.createdAt.toDate().toLocaleString()
    : new Date().toLocaleString();
  const roomLabel = reservation.roomName || `Room ${reservation.roomNumber || ''} (${reservation.roomType || ''})`;
  const nights = Number(reservation.nights) || 1;
  const roomTotal = Number(reservation.totalAmount || 0);
  const nightlyRate = Number(reservation.roomRate || roomTotal / nights);
  const extraCharges = Number(reservation.extraCharges || 0);
  const taxes = Number(reservation.taxAmount || 0);
  const total = roomTotal + extraCharges + taxes;
  const subject = `Payment receipt ${receiptNumber} — ${rawGuestName}`;
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
      ${moneyRow('Room', escapeHtml(roomLabel))}
      ${moneyRow('Check-in', escapeHtml(reservation.checkIn || '—'))}
      ${moneyRow('Check-out', escapeHtml(reservation.checkOut || '—'))}
      ${moneyRow('Stay duration', stayUnitLabel(reservation, nights))}
    </table>
    <h2>Payment details</h2>
    <table>
      ${moneyRow('Payment method', escapeHtml(payment.method || 'Not specified'))}
      ${moneyRow('Room rate', `₱${nightlyRate.toLocaleString()} × ${stayUnitLabel(reservation, nights)}`)}
      ${moneyRow('Room charges', `₱${roomTotal.toLocaleString()}`)}
      ${moneyRow('Extra charges', `₱${extraCharges.toLocaleString()}`)}
      ${moneyRow('Taxes', `₱${taxes.toLocaleString()}`)}
      ${moneyRow('Total charges', `₱${total.toLocaleString()}`)}
      ${moneyRow('Amount received', `₱${paymentAmount.toLocaleString()}`, true)}
      ${moneyRow('Remaining balance', `₱${Math.max(0, balanceRemaining).toLocaleString()}`)}
    </table>
    <footer>This electronic receipt was issued by Lawiswis Kawayan Garden Resort. For assistance, contact the resort and provide receipt ${escapeHtml(receiptNumber)}.</footer>
  </main>
</body>
</html>`;
  return transporter.sendMail({
    from: FROM_ADDRESS,
    to: reservation.email || reservation.guestEmail,
    subject,
    text: `Hello ${rawGuestName},\n\nWe received your payment of ₱${paymentAmount.toLocaleString()} for booking #${bookingReference}.\nYour electronic receipt ${receiptNumber} is attached as an HTML document.`,
    html: `<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;color:#1f2937"><h2 style="color:#1a3a1a">Payment received</h2><p>Hello ${guestName},</p><p>Your payment of <strong>₱${paymentAmount.toLocaleString()}</strong> has been recorded. Your e-receipt is attached to this email.</p><p style="color:#6b7280;font-size:12px">Receipt ${escapeHtml(receiptNumber)} · Booking #${escapeHtml(bookingReference)}</p></div>`,
    attachments: [{
      filename: `${receiptNumber}.html`,
      content: receiptHtml,
      contentType: 'text/html',
    }],
  });
}

export async function sendReservationPendingEmail(reservation, bookingRef) {
  const { guestName, email, roomNumber, roomType, checkIn, checkOut, totalAmount, nights, paymentMethod } = reservation;
  const subject = `Reservation received — #${bookingRef}`;
  const statusNote = paymentMethod === 'cash'
    ? `Your reservation is <strong>pending confirmation</strong> from our team. Please prepare the total amount in cash upon arrival — we'll follow up shortly to confirm your stay.`
    : `Your reservation is pending payment. If you haven't completed payment yet, please return to the booking page to finish checkout.`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; color:#1f2937;">
      <h2 style="color:#1a3a1a;">Thanks, ${guestName}!</h2>
      <p>We've received your reservation request for <strong>Room ${roomNumber} (${roomType})</strong>.</p>
      <table style="width:100%; font-size:14px; margin: 16px 0; border-collapse:collapse;">
        ${moneyRow('Booking Reference', `#${bookingRef}`)}
        ${moneyRow('Check-in', checkIn)}
        ${moneyRow('Check-out', checkOut)}
        ${moneyRow('Nights', nights)}
        ${moneyRow('Total', `₱${Number(totalAmount).toLocaleString()}`, true)}
      </table>
      <p>${statusNote}</p>
      <p>Your official booking receipt and confirmation details will be sent to the email address provided.</p>
      <p style="color:#9ca3af; font-size:12px;">If you have any questions, just reply to this email or contact us directly.</p>
    </div>`;
  return transporter.sendMail({ from: FROM_ADDRESS, to: email, subject, html });
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
  const guestName = escapeHtml(reservation.guestName || 'Guest');
  const safeReason = escapeHtml(reason || 'The resort reviewed your refund request.');
  const heading = outcome === 'eligible'
    ? 'Your refund request was approved.'
    : outcome === 'approved'
      ? 'Your refund is being processed.'
    : outcome === 'rejected'
      ? 'Your refund request was not approved.'
    : outcome === 'not_eligible'
      ? 'An update on your refund request'
      : outcome === 'refunded'
        ? 'Your refund has been confirmed.'
        : outcome === 'failed'
          ? 'Your refund needs further review.'
          : 'Your refund request needs manual review.';
  const alternativesHtml = alternatives.length
    ? `<p><strong>Other options:</strong></p><ul>${alternatives.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`
    : '';
  const subject = `${heading} — #${bookingRef}`;
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;color:#1f2937;">
      <h2 style="color:#1a3a1a;">${escapeHtml(heading)}, ${guestName}</h2>
      <p>${safeReason}</p>
      ${amount > 0 ? `<p><strong>Refund amount:</strong> ₱${Number(amount).toLocaleString()}</p>` : ''}
      ${processorReference ? `<p><strong>Processor reference:</strong> ${escapeHtml(processorReference)}</p>` : ''}
      <p>${escapeHtml(timeline)}</p>
      ${alternativesHtml}
      <p>Booking reference: #${escapeHtml(bookingRef)}. Please reply to this email or contact the resort if you have questions.</p>
    </div>`;
  return transporter.sendMail({ from: FROM_ADDRESS, to: reservation.email || reservation.guestEmail, subject, html });
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
  const subject = `${status} — #${bookingRef}`;
  const payment = paymentUrl
    ? `<p><strong>Required deposit:</strong> ₱${Number(change.paymentDue || 0).toLocaleString()}</p><p><a href="${escapeHtml(paymentUrl)}">Pay the deposit securely</a></p>`
    : '';
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;color:#1f2937;">
      <h2 style="color:#1a3a1a;">${escapeHtml(status.replace(/\.$/, ''))}, ${guestName}</h2>
      <table style="width:100%;font-size:14px;margin:16px 0;border-collapse:collapse;">
        ${moneyRow('Booking reference', `#${escapeHtml(bookingRef)}`)}
        ${moneyRow('Check-in', escapeHtml(change.checkIn || reservation.checkIn))}
        ${moneyRow('Check-out', escapeHtml(change.checkOut || reservation.checkOut))}
        ${moneyRow('Updated reservation total', `₱${Number(change.updatedTotal || reservation.totalAmount || 0).toLocaleString()}`)}
        ${change.cancellationFee > 0 ? moneyRow('Shortened-stay cancellation fee', `₱${Number(change.cancellationFee).toLocaleString()}`) : ''}
        ${change.refundDue > 0 ? moneyRow('Refund pending processor confirmation', `₱${Number(change.refundDue).toLocaleString()}`, true) : ''}
      </table>
      ${payment}
      ${change.reason ? `<p>${escapeHtml(change.reason)}</p>` : ''}
      <p>Your updated booking receipt will be sent after any required payment or refund is confirmed.</p>
    </div>`;
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

function mdy(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value || ''));
  return match ? `${match[2]}/${match[3]}/${match[1]}` : String(value || '');
}

export async function sendArrivalReminderEmail(reservation, bookingRef) {
  const guestName = escapeHtml(reservation.guestName || 'Guest');
  const roomName = escapeHtml(reservation.roomName || `Room ${reservation.roomNumber || ''}`);
  const checkInTime = escapeHtml(reservation.checkInTime || '2:00 PM');
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;color:#1f2937;">
      <h2 style="color:#1a3a1a;">See you tomorrow, ${guestName}!</h2>
      <p>This is a friendly reminder that your stay at Lawiswis Kawayan Garden Resort begins tomorrow.</p>
      <table style="width:100%;font-size:14px;margin:16px 0;border-collapse:collapse;">
        ${moneyRow('Guest', guestName)}
        ${moneyRow('Booking reference', `#${escapeHtml(bookingRef)}`, true)}
        ${moneyRow('Check-in', `${mdy(reservation.checkIn)} at ${checkInTime}`)}
        ${moneyRow('Check-out', `${mdy(reservation.checkOut)}${reservation.checkOutTime ? ` at ${escapeHtml(reservation.checkOutTime)}` : ''}`)}
        ${moneyRow('Room', roomName)}
      </table>
      <h3 style="font-size:15px;color:#1a3a1a;">Resort guidelines</h3>
      <ul style="padding-left:18px;line-height:1.6;">
        <li>Bring a valid photo ID and your booking reference.</li>
        <li>Settle any remaining balance at the front desk.</li>
        <li>Please respect quiet hours and keep the resort grounds clean.</li>
        <li>If you will arrive late, contact the front desk so we can hold your reservation.</li>
      </ul>
      <p>Address: 402 Brgy. Buguion, Calumpit, Bulacan · Mobile: 0917 811 2332</p>
    </div>`;
  return transporter.sendMail({ from: FROM_ADDRESS, to: reservation.email || reservation.guestEmail, subject: `Reminder: your stay begins tomorrow — #${bookingRef}`, html });
}

export async function sendThankYouEmail(reservation, bookingRef, feedbackUrl) {
  const guestName = escapeHtml(reservation.guestName || 'Guest');
  const safeUrl = escapeHtml(feedbackUrl);
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(feedbackUrl)}`;
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;color:#1f2937;text-align:center;">
      <h2 style="color:#1a3a1a;">Thank you for staying with us, ${guestName}!</h2>
      <p>We hope you enjoyed your stay at Lawiswis Kawayan Garden Resort (booking #${escapeHtml(bookingRef)}). We would love to hear how it went.</p>
      <p>Scan the QR code to share your feedback:</p>
      <img src="${qrUrl}" alt="Feedback QR code" width="200" height="200" style="margin:8px auto;" />
      <p><a href="${safeUrl}" style="color:#1a3a1a;font-weight:700;">Open the feedback form</a></p>
      <p style="font-size:12px;color:#6b7280;">We look forward to welcoming you again.</p>
    </div>`;
  return transporter.sendMail({ from: FROM_ADDRESS, to: reservation.email || reservation.guestEmail, subject: 'Thank you for staying with us', html });
}

export async function sendPaymentConfirmedEmail(reservation, bookingRef) {
  const { guestName, email, roomNumber, roomType, checkIn, checkOut, totalAmount, nights, amountPaid, paymentStatus } = reservation;
  const isFullyPaid = paymentStatus === 'paid';
  const subject = `${isFullyPaid ? 'Booking confirmed' : 'Payment received'} — #${bookingRef}`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; color:#1f2937;">
      <h2 style="color:#1a3a1a;">${isFullyPaid ? `You're all set, ${guestName}!` : `Payment received, ${guestName}.`}</h2>
      <p>Your reservation for <strong>Room ${roomNumber} (${roomType})</strong> ${isFullyPaid ? 'is confirmed.' : 'has a payment recorded. The remaining balance, if any, is due before checkout.'}</p>
      <table style="width:100%; font-size:14px; margin: 16px 0; border-collapse:collapse;">
        ${moneyRow('Booking Reference', `#${bookingRef}`)}
        ${moneyRow('Check-in', checkIn)}
        ${moneyRow('Check-out', checkOut)}
        ${moneyRow('Nights', nights)}
        ${moneyRow('Amount Paid', `₱${Number(amountPaid || totalAmount).toLocaleString()}`, true)}
        ${!isFullyPaid ? moneyRow('Reservation Total', `₱${Number(totalAmount).toLocaleString()}`) : ''}
      </table>
      <p>Your official booking receipt and confirmation details will be sent to the email address provided.</p>
      <p>We look forward to welcoming you. See you soon!</p>
    </div>`;
  return transporter.sendMail({ from: FROM_ADDRESS, to: email, subject, html });
}
