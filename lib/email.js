// Transactional email via SMTP (same setup as Horizon Pro). Set SMTP_HOST,
// SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM in Vercel. Without SMTP, emails
// are logged to the function logs instead of sent.
let transporter = null;
function getTransporter() {
  if (!process.env.SMTP_HOST) return null;
  if (!transporter) {
    const nodemailer = require('nodemailer');
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: process.env.SMTP_SECURE === 'true',
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
    });
  }
  return transporter;
}

async function sendEmail({ to, subject, text, html }) {
  const t = getTransporter();
  if (!t) {
    console.log(`[email:dev-fallback] No SMTP configured — would have sent to ${to}\nSubject: ${subject}\n${text}`);
    return { delivered: false };
  }
  await t.sendMail({ from: process.env.SMTP_FROM || `TipTrack <${process.env.SMTP_USER || 'no-reply@tiptrack.app'}>`, to, subject, text, html });
  return { delivered: true };
}

module.exports = { sendEmail };
