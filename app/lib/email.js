// Email sender via nodemailer/SMTP. Skips when SMTP_USER not set.
import nodemailer from 'nodemailer';

const HOST = process.env.SMTP_HOST || '';
const PORT = Number(process.env.SMTP_PORT || 587);
const USER = process.env.SMTP_USER || '';
const PASS = process.env.SMTP_PASS || '';
const FROM = process.env.SMTP_FROM || 'Cheap Travels India <support@cheaptravels.in>';

let _t = null;
function transporter() {
  if (_t) return _t;
  if (!HOST || !USER) return null;
  _t = nodemailer.createTransport({
    host: HOST, port: PORT, secure: PORT === 465,
    auth: { user: USER, pass: PASS },
  });
  return _t;
}

export function isConfigured() { return !!transporter(); }

export async function sendTicketEmail({ to, subject, html, pdfBuffer, pdfFilename }) {
  const t = transporter();
  if (!t) {
    console.log('[email:mock]', { to, subject });
    return { ok: true, mocked: true };
  }
  try {
    const info = await t.sendMail({
      from: FROM,
      to,
      subject,
      html,
      attachments: pdfBuffer ? [{ filename: pdfFilename || 'ticket.pdf', content: pdfBuffer }] : [],
    });
    return { ok: true, messageId: info.messageId };
  } catch (e) {
    console.error('[email:error]', e);
    return { ok: false, error: String(e?.message || e) };
  }
}
