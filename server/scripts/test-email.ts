// Sends one test email with the SMTP settings in .env, to check that
// "Forgot password" emails will be delivered.
// Usage: npm run test-email -- someone@gmail.com

import dotenv from 'dotenv';

dotenv.config();
const { mailConfigured, mailProvider, sendMail } = await import('../mail.ts');

const to = process.argv[2];
if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
  console.error('Usage: npm run test-email -- someone@gmail.com');
  process.exit(1);
}
if (!mailConfigured()) {
  console.error('Email is not configured in .env. Add BREVO_API_KEY, or SMTP_HOST, SMTP_PORT, SMTP_USER and SMTP_PASSWORD, plus MAIL_FROM (see .env.example).');
  process.exit(1);
}
const p = mailProvider();
console.log(`Sending with: ${p === 'relay' ? 'Gmail relay (Apps Script)' : p === 'brevo' ? 'Brevo API' : 'SMTP (' + process.env.SMTP_HOST + ')'}`);
// Make sendMail report the real error instead of only logging it.
process.env.NODE_ENV = process.env.NODE_ENV || 'development';
const ok = await sendMail(
  to,
  'CertiGen test email',
  'This is a test from CertiGen. If you can read it, "Forgot password" emails will be delivered.',
  '<p>This is a test from CertiGen. If you can read it, “Forgot password” emails will be delivered.</p>'
);
console.log(
  ok
    ? `Sent. Check the inbox (and spam folder) of ${to}.`
    : 'Sending failed — see the [mail] message above. Gmail relay: check GMAIL_RELAY_URL (ends in /exec) and that GMAIL_RELAY_SECRET matches the script. Brevo: check BREVO_API_KEY. Gmail SMTP: check SMTP_USER, SMTP_PASSWORD and MAIL_FROM.'
);
// Let Node exit on its own: process.exit() while the network handles close crashes libuv on Windows.
process.exitCode = ok ? 0 : 1;
