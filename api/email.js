// lib/email.js
//
// Sends transactional emails via Gmail SMTP (using an App Password).
// Two templates:
//
//   sendReservationPendingEmail  — fired right after a reservation is
//     created (both cash and online). Confirms we received the request;
//     does NOT claim payment has happened.
//
//   sendPaymentConfirmedEmail    — fired once payment is actually verified
//     (from the PayMongo webhook for online payments, or from a staff
//     "confirm" action in the admin panel for cash bookings).
//
// Required environment variables:
//   GMAIL_USER          — the full Gmail address sending these emails
//   GMAIL_APP_PASSWORD  — a 16-character App Password generated at
//                          myaccount.google.com/apppasswords
//                          (requires 2-Step Verification to be enabled
//                          on that Google account first)

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

export async function sendReservationConfirmationEmail(reservation, bookingRef) {
  const guestName = escapeHtml(reservation.guestName || 'Guest');
  const roomName = escapeHtml(reservation.roomName || `Room ${reservation.roomNumber || ''} (${reservation.roomType || ''})`);
  const nights = Number(reservation.nights) || Math.ceil((new Date(reservation.checkOut) - new Date(reservation.checkIn)) / 86400000);
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
        ${moneyRow('Duration', `${nights} night${nights === 1 ? '' : 's'}`)}
        ${moneyRow('Booking reference', `#${escapeHtml(bookingRef)}`, true)}
      </table>
      <h3 style="font-size:15px;color:#1a3a1a;">Check-in policies</h3>
      <p>Please bring a valid photo ID and present your booking reference at reception. Check-in and check-out times are subject to the resort's published schedule; contact the resort if you need to confirm your arrival time.</p>
    </div>`;
  return transporter.sendMail({ from: FROM_ADDRESS, to: reservation.email || reservation.guestEmail, subject, html });
}

export async function sendPaymentReceiptEmail(reservation, payment, receiptNumber, balanceRemaining) {
  const guestName = escapeHtml(reservation.guestName || 'Guest');
  const paymentDate = payment.createdAt?.toDate
    ? payment.createdAt.toDate().toLocaleString()
    : new Date().toLocaleString();
  const nights = Number(reservation.nights) || 1;
  const roomTotal = Number(reservation.totalAmount || 0);
  const nightlyRate = Number(reservation.roomRate || roomTotal / nights);
  const extraCharges = Number(reservation.extraCharges || 0);
  const taxes = Number(reservation.taxAmount || 0);
  const total = roomTotal + extraCharges + taxes;
  const subject = `Payment receipt ${receiptNumber} — ${guestName}`;
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;color:#1f2937;">
      <h2 style="color:#1a3a1a;">Payment received</h2>
      <p>Hello ${guestName}, this is your receipt for payment ${escapeHtml(receiptNumber)}.</p>
      <table style="width:100%;font-size:14px;margin:16px 0;border-collapse:collapse;">
        ${moneyRow('Receipt number', escapeHtml(receiptNumber))}
        ${moneyRow('Date of payment', escapeHtml(paymentDate))}
        ${moneyRow('Payment method', escapeHtml(payment.method || 'Not specified'))}
        ${moneyRow('Room rate', `₱${nightlyRate.toLocaleString()} × ${nights} night${nights === 1 ? '' : 's'}`)}
        ${moneyRow('Room charges', `₱${roomTotal.toLocaleString()}`)}
        ${moneyRow('Extra charges', `₱${extraCharges.toLocaleString()}`)}
        ${moneyRow('Taxes', `₱${taxes.toLocaleString()}`)}
        ${moneyRow('Total charges', `₱${total.toLocaleString()}`)}
        ${moneyRow('Amount paid in this transaction', `₱${Number(payment.amount || 0).toLocaleString()}`, true)}
        ${moneyRow('Balance remaining', `₱${Math.max(0, balanceRemaining).toLocaleString()}`)}
      </table>
      <p style="color:#6b7280;font-size:12px;">Booking reference: #${escapeHtml(reservation.id?.slice(0, 8).toUpperCase() || '')}. This email is your printable HTML receipt.</p>
    </div>`;
  return transporter.sendMail({ from: FROM_ADDRESS, to: reservation.email || reservation.guestEmail, subject, html });
}

export async function sendReservationPendingEmail(reservation, bookingRef) {
  const { guestName, email, roomNumber, roomType, checkIn, checkOut, totalAmount, nights, paymentMethod } = reservation;

  const subject = `Reservation received — #${bookingRef}`;
  const statusNote =
    paymentMethod === 'cash'
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
    </div>
  `;

  return transporter.sendMail({ from: FROM_ADDRESS, to: email, subject, html });
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
    </div>
  `;

  return transporter.sendMail({ from: FROM_ADDRESS, to: email, subject, html });
}