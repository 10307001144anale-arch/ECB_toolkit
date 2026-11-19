// Sends one test email with the SMTP settings in .env, to check that
// "Forgot password" emails will be delivered.
// Usage: npm run test-email -- someone@gmail.com

import dotenv from 'dotenv';

dotenv.config();
const { mailConfigured, sendMail } = await import('../mail.ts');

const to = process.argv[2];
if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
  console.error('Usage: npm run test-email -- someone@gmail.com');
  process.exit(1);
}
if (!mailConfigured()) {
  console.error('SMTP_HOST is not set in .env. Add SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD and MAIL_FROM first (see .env.example).');
  process.exit(1);
}
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
    : 'Sending failed — see the [mail] message above. Check SMTP_USER and SMTP_PASSWORD (for Gmail: an App password, and MAIL_FROM with the same address).'
);
// Let Node exit on its own: process.exit() while the network handles close crashes libuv on Windows.
process.exitCode = ok ? 0 : 1;
