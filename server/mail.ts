// Outgoing email (password reset codes), sent through an SMTP mailbox —
// normally Gmail with an App password:
//   SMTP_HOST="smtp.gmail.com"  SMTP_PORT="587"
//   SMTP_USER="sender@gmail.com"  SMTP_PASSWORD="<16-letter app password>"
//   MAIL_FROM="ECB CertiGen <sender@gmail.com>"   (same address as SMTP_USER)
// Message bodies are never written to the logs (they contain one-time codes).

import nodemailer, { type Transporter } from 'nodemailer';

export function mailConfigured(): boolean {
  return !!process.env.SMTP_HOST;
}

function sender(): string {
  const user = process.env.SMTP_USER;
  return process.env.MAIL_FROM || (user ? `ECB CertiGen <${user}>` : 'ECB CertiGen <no-reply@localhost>');
}

let transport: Transporter | null = null;

function getTransport(): Transporter {
  if (!transport) {
    const port = Number(process.env.SMTP_PORT || 587);
    transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: process.env.SMTP_SECURE ? process.env.SMTP_SECURE === 'true' : port === 465,
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: (process.env.SMTP_PASSWORD || '').replace(/\s+/g, '') } : undefined,
    });
  }
  return transport;
}

/** Sends one email. Returns false (and logs the reason, never the content) when it could not be sent. */
export async function sendMail(to: string, subject: string, text: string, html: string): Promise<boolean> {
  if (!mailConfigured()) {
    // Never log the subject or body: they contain the one-time code.
    console.warn('[mail] Email is not configured (set SMTP_HOST, SMTP_USER and SMTP_PASSWORD); an email was not sent.');
    return false;
  }
  try {
    await getTransport().sendMail({ from: sender(), to, subject, text, html });
    return true;
  } catch (e: any) {
    console.warn(`[mail] could not send an email: ${String(e.message).replace(/\d{6}/g, '******')}`);
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
