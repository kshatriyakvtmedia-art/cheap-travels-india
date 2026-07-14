// Email OTP delivery via Resend.
// Requires RESEND_API_KEY in .env — throws at startup if missing in production
// so a misconfigured deploy fails loudly rather than silently dropping OTPs.

import { Resend } from 'resend';

const FROM   = process.env.RESEND_FROM_EMAIL || 'Cheap Travels India <otp@cheapbus.in>';
const API_KEY = process.env.RESEND_API_KEY;

if (!API_KEY && process.env.NODE_ENV === 'production') {
  throw new Error('FATAL: RESEND_API_KEY must be set in production. OTP email delivery will not work without it.');
}

function getClient() {
  if (!API_KEY) throw new Error('RESEND_API_KEY is not configured.');
  return new Resend(API_KEY);
}

/**
 * Send a 6-digit OTP to the given email address.
 * @param {string} email  Recipient email
 * @param {string} code   6-digit OTP string
 */
export async function sendEmailOtp(email, code) {
  const resend = getClient();

  const html = `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:'Segoe UI',Arial,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:32px 0">
    <tr><td align="center">
      <table width="480" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);max-width:480px;width:100%">
        <!-- Header -->
        <tr>
          <td style="background:#0E7B4F;padding:24px 32px">
            <div style="font-size:20px;font-weight:800;color:#fff;letter-spacing:-0.3px">🚌 Cheap Travels India</div>
            <div style="font-size:13px;color:rgba(255,255,255,0.75);margin-top:2px">Verification code</div>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="padding:32px">
            <p style="margin:0 0 8px;font-size:15px;color:#1e293b;font-weight:600">Your verification code</p>
            <p style="margin:0 0 24px;font-size:14px;color:#64748b;line-height:1.6">
              Use the code below to complete your login. It's valid for <strong>5 minutes</strong> and can only be used once.
            </p>
            <!-- OTP block -->
            <div style="background:#f1fdf7;border:2px solid #0E7B4F;border-radius:12px;padding:20px;text-align:center;margin-bottom:24px">
              <div style="font-size:36px;font-weight:800;letter-spacing:10px;color:#0E7B4F;font-family:'Courier New',monospace">${code}</div>
            </div>
            <p style="margin:0;font-size:13px;color:#94a3b8;line-height:1.5">
              If you didn't request this code, you can safely ignore this email.<br>
              Never share this code with anyone — Cheap Travels India will never ask for it.
            </p>
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="background:#f8fafc;padding:16px 32px;border-top:1px solid #f1f5f9">
            <p style="margin:0;font-size:11px;color:#cbd5e1;text-align:center">
              © ${new Date().getFullYear()} Cheap Travels India · cheapbus.in
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`.trim();

  const { data, error } = await resend.emails.send({
    from   : FROM,
    to     : [email],
    subject: `${code} is your Cheap Travels India code`,
    html,
  });

  if (error) {
    console.error('[email-otp:error]', error);
    return { ok: false, error: error.message || 'Email delivery failed.' };
  }

  return { ok: true, id: data?.id };
}
