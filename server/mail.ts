// Outgoing email (password reset links). Configure SMTP_HOST, SMTP_PORT,
// SMTP_USER, SMTP_PASSWORD and MAIL_FROM. Without SMTP the message is not sent:
// in development the link is printed to the server log instead.

import nodemailer, { type Transporter } from 'nodemailer';

let transport: Transporter | null | undefined;

export function mailConfigured(): boolean {
  return !!process.env.SMTP_HOST;
}

function getTransport(): Transporter | null {
  if (transport !== undefined) return transport;
  if (!mailConfigured()) return (transport = null);
  const port = Number(process.env.SMTP_PORT || 587);
  transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: process.env.SMTP_SECURE ? process.env.SMTP_SECURE === 'true' : port === 465,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD || '' } : undefined,
  });
  return transport;
}

export async function sendMail(to: string, subject: string, text: string, html: string): Promise<boolean> {
  const t = getTransport();
  if (!t) {
    if (process.env.NODE_ENV !== 'production') console.log(`[mail] SMTP not configured. Message to ${to}:\n  ${subject}\n  ${text.replace(/\n/g, '\n  ')}`);
    else console.warn('[mail] SMTP is not configured; a password reset email could not be sent.');
    return false;
  }
  try {
    await t.sendMail({ from: process.env.MAIL_FROM || process.env.SMTP_USER, to, subject, text, html });
    return true;
  } catch (e: any) {
    console.warn('[mail] sending failed:', e.message);
    return false;
  }
}

/**
 * Base URL for links in emails. Production uses APP_URL only — never the
 * request's Host header, which a caller could forge to redirect reset links.
 */
export function appUrl(req: { protocol: string; get(name: string): string | undefined }): string | null {
  const configured = (process.env.APP_URL || process.env.RENDER_EXTERNAL_URL || '').replace(/\/+$/, '');
  if (configured) return configured;
  return process.env.NODE_ENV === 'production' ? null : `${req.protocol}://${req.get('host')}`;
}
