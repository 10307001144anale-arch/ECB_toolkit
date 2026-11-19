/**
 * ECB CertiGen — Gmail relay (Google Apps Script).
 *
 * Sends CertiGen's password-reset codes from your own Gmail over HTTPS, so it
 * works on hosts that block email ports (e.g. Render's free plan).
 *
 * Setup (see README → "Gmail relay"):
 *   1. script.google.com → New project → paste this file → Save.
 *   2. Project Settings (gear) → Script Properties → Add property:
 *        RELAY_SECRET = the same long random value as GMAIL_RELAY_SECRET in CertiGen.
 *   3. Deploy → New deployment → Web app → Execute as: Me, Who has access: Anyone → Deploy,
 *      allow the permissions, copy the Web app URL (ends in /exec) into GMAIL_RELAY_URL.
 *
 * Only requests carrying the secret are accepted, and only CertiGen emails are sent.
 * Daily limit: about 100 recipients for a personal Gmail account.
 */

function doPost(e) {
  try {
    var expected = PropertiesService.getScriptProperties().getProperty('RELAY_SECRET');
    if (!expected || expected.length < 24) return reply_(false, 'RELAY_SECRET is not set in Script Properties');

    var data = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (!safeEqual_(String(data.secret || ''), expected)) return reply_(false, 'unauthorized');

    var to = String(data.to || '').trim();
    var subject = String(data.subject || '');
    if (!/^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(to)) return reply_(false, 'invalid recipient');
    // Only CertiGen messages: the relay cannot be used to send anything else.
    if (subject.indexOf('ECB CertiGen') === -1 && subject.indexOf('CertiGen test email') === -1) return reply_(false, 'subject not allowed');

    MailApp.sendEmail({
      to: to,
      subject: subject,
      body: String(data.text || ''),
      htmlBody: String(data.html || ''),
      name: String(data.name || 'ECB CertiGen'),
    });
    return reply_(true);
  } catch (err) {
    return reply_(false, String(err && err.message ? err.message : err));
  }
}

/** Opening the URL in a browser shows that the relay is running (sends nothing). */
function doGet() {
  return reply_(true, 'ECB CertiGen Gmail relay is running. Emails left today: ' + MailApp.getRemainingDailyQuota());
}

function reply_(ok, error) {
  var out = { ok: ok };
  if (error) out[ok ? 'info' : 'error'] = error;
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

/** Compares secrets in constant time. */
function safeEqual_(a, b) {
  if (a.length !== b.length) return false;
  var diff = 0;
  for (var i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
