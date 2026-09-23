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
      <p style="color:#9ca3af; font-size:12px;">If you have any questions, just reply to this email or contact us directly.</p>
    </div>
  `;

  return transporter.sendMail({ from: FROM_ADDRESS, to: email, subject, html });
}

export async function sendPaymentConfirmedEmail(reservation, bookingRef) {
  const { guestName, email, roomNumber, roomType, checkIn, checkOut, totalAmount, nights } = reservation;

  const subject = `Booking confirmed — #${bookingRef}`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; color:#1f2937;">
      <h2 style="color:#1a3a1a;">You're all set, ${guestName}!</h2>
      <p>Your reservation for <strong>Room ${roomNumber} (${roomType})</strong> is now <strong>confirmed</strong>.</p>
      <table style="width:100%; font-size:14px; margin: 16px 0; border-collapse:collapse;">
        ${moneyRow('Booking Reference', `#${bookingRef}`)}
        ${moneyRow('Check-in', checkIn)}
        ${moneyRow('Check-out', checkOut)}
        ${moneyRow('Nights', nights)}
        ${moneyRow('Total Paid', `₱${Number(totalAmount).toLocaleString()}`, true)}
      </table>
      <p>We look forward to welcoming you. See you soon!</p>
    </div>
  `;

  return transporter.sendMail({ from: FROM_ADDRESS, to: email, subject, html });
}