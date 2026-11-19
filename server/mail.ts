// Outgoing email (password reset codes). Two delivery options, chosen by .env:
//   1. Resend (recommended): RESEND_API_KEY and MAIL_FROM (a sender on a domain
//      verified in Resend, e.g. "CertiGen <no-reply@your-domain>").
//   2. SMTP: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD and MAIL_FROM.
// Message bodies are never written to the logs (they contain one-time codes).

import nodemailer, { type Transporter } from 'nodemailer';
import { Resend } from 'resend';

export type MailProvider = 'resend' | 'smtp' | null;

export function mailProvider(): MailProvider {
  if (process.env.RESEND_API_KEY) return 'resend';
  if (process.env.SMTP_HOST) return 'smtp';
  return null;
}

export function mailConfigured(): boolean {
  return mailProvider() !== null;
}

function sender(): string {
  return process.env.MAIL_FROM || process.env.SMTP_USER || 'ECB CertiGen <onboarding@resend.dev>';
}

let resend: Resend | null = null;
let transport: Transporter | null = null;

async function sendWithResend(to: string, subject: string, text: string, html: string) {
  resend ??= new Resend(process.env.RESEND_API_KEY);
  const { error } = await resend.emails.send({ from: sender(), to: [to], subject, text, html });
  if (error) throw new Error(`${error.name}: ${error.message}`);
}

async function sendWithSmtp(to: string, subject: string, text: string, html: string) {
  if (!transport) {
    const port = Number(process.env.SMTP_PORT || 587);
    transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: process.env.SMTP_SECURE ? process.env.SMTP_SECURE === 'true' : port === 465,
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD || '' } : undefined,
    });
  }
  await transport.sendMail({ from: sender(), to, subject, text, html });
}

/** Sends one email. Returns false (and logs the reason, never the content) when it could not be sent. */
export async function sendMail(to: string, subject: string, text: string, html: string): Promise<boolean> {
  const provider = mailProvider();
  if (!provider) {
    console.warn(`[mail] Email is not configured (set RESEND_API_KEY or SMTP_HOST); "${subject}" was not sent.`);
    return false;
  }
  try {
    if (provider === 'resend') await sendWithResend(to, subject, text, html);
    else await sendWithSmtp(to, subject, text, html);
    return true;
  } catch (e: any) {
    console.warn(`[mail] ${provider} could not send "${subject}": ${e.message}`);
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

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** The verification-code email: ECB navy and orange, the code, its expiry, and safety advice. */
export function otpEmail(name: string, code: string, minutes: number): { subject: string; text: string; html: string } {
  const subject = `${code} is your ECB CertiGen verification code`;
  const text = [
    `Hello ${name},`,
    '',
    'Use this code to reset your CertiGen (Election Commission of Bhutan) password:',
    '',
    `    ${code}`,
    '',
    `The code expires in ${minutes} minutes and works only once.`,
    '',
    'Never share this code. ECB staff will never ask you for it.',
    'If you did not ask to reset your password, ignore this email — your password stays the same.',
  ].join('\n');
  const html = `<!doctype html>
<html><body style="margin:0;padding:0;background:#f3f5f9;font-family:Roboto,Arial,Helvetica,sans-serif;color:#2b2b2b">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f5f9;padding:24px 12px">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0">
  <tr><td style="background:#002f6c;padding:20px 28px;color:#ffffff">
    <div style="font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#f7941d;font-weight:bold">CertiGen</div>
    <div style="font-size:18px;font-weight:bold;margin-top:4px">Election Commission of Bhutan</div>
  </td></tr>
  <tr><td style="height:4px;background:#f7941d;font-size:0;line-height:0">&nbsp;</td></tr>
  <tr><td style="padding:28px">
    <h1 style="margin:0 0 12px;font-size:20px;color:#002f6c">Reset your password</h1>
    <p style="margin:0 0 20px;font-size:15px;line-height:1.5">Hello ${esc(name)}, use this verification code to reset your CertiGen password:</p>
    <div style="text-align:center;margin:0 0 20px">
      <span style="display:inline-block;padding:14px 24px;border-radius:10px;background:#eef3fb;border:1px solid #c9d6ea;font-size:32px;font-weight:bold;letter-spacing:10px;color:#002f6c;font-family:'Courier New',Courier,monospace">${esc(code)}</span>
    </div>
    <p style="margin:0 0 8px;font-size:14px;line-height:1.5"><strong>This code expires in ${minutes} minutes</strong> and can be used only once.</p>
    <div style="margin:20px 0 0;padding:14px 16px;border-radius:8px;background:#fff7ed;border:1px solid #f7c58a;font-size:13px;line-height:1.5;color:#7a3e00">
      <strong>Keep your account safe:</strong> never share this code with anyone. ECB staff will never ask you for it.
      If you did not ask to reset your password, ignore this email — your password stays the same.
    </div>
  </td></tr>
  <tr><td style="padding:16px 28px;border-top:1px solid #e2e8f0;font-size:12px;color:#64748b">
    Ensuring Free, Fair and Democratic Elections and Referendums · www.ecb.bt
  </td></tr>
</table>
</td></tr></table>
</body></html>`;
  return { subject, text, html };
}
