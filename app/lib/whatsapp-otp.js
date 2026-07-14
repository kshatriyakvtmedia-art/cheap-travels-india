// ─────────────────────────────────────────────────────────────────────────────
// RESERVED FOR FUTURE USE — WhatsApp Cloud API OTP delivery
//
// OTP delivery currently uses email via Resend (see lib/email-otp.js).
// When switching back to WhatsApp, un-comment this file and swap the import
// in app/api/otp/send/route.js.
//
// REQUIRED setup in Meta Business Manager before enabling:
//   1. Create a template named WHATSAPP_OTP_TEMPLATE (default: cheap_travels_otp)
//   2. Category: AUTHENTICATION — Language: English (en)
//   3. Body: "Your Cheap Travels India OTP is {{1}}. Valid for 5 minutes. Do not share."
//   4. Get it approved (24-48 hrs) before setting env vars live.
// ─────────────────────────────────────────────────────────────────────────────

// const TOKEN           = process.env.WHATSAPP_API_TOKEN        || '';
// const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID  || '';
// const TEMPLATE        = process.env.WHATSAPP_OTP_TEMPLATE     || 'cheap_travels_otp';
//
// export function isConfigured() {
//   return !!(TOKEN && PHONE_NUMBER_ID);
// }
//
// /**
//  * Send a 6-digit OTP to an Indian mobile via WhatsApp Cloud API.
//  * @param {string} mobile  10-digit Indian mobile number (no country code)
//  * @param {string} code    6-digit OTP string
//  */
// export async function sendOtpWhatsApp(mobile, code) {
//   const digits = mobile.replace(/\D/g, '').replace(/^0+/, '');
//   const to = digits.length === 10 ? '91' + digits : digits;
//
//   if (!isConfigured()) {
//     console.log('[whatsapp-otp:mock] would send OTP to', to, '— code logged server-side only');
//     return { ok: true, mocked: true };
//   }
//
//   const url = `https://graph.facebook.com/v20.0/${PHONE_NUMBER_ID}/messages`;
//   const payload = {
//     messaging_product: 'whatsapp',
//     to,
//     type: 'template',
//     template: {
//       name: TEMPLATE,
//       language: { code: 'en' },
//       components: [{ type: 'body', parameters: [{ type: 'text', text: code }] }],
//     },
//   };
//
//   try {
//     const res = await fetch(url, {
//       method: 'POST',
//       headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
//       body: JSON.stringify(payload),
//     });
//     const data = await res.json().catch(() => ({}));
//     if (!res.ok) {
//       console.error('[whatsapp-otp:error]', data);
//       return { ok: false, error: data?.error?.message || `HTTP ${res.status}` };
//     }
//     return { ok: true, response: data };
//   } catch (err) {
//     console.error('[whatsapp-otp:error]', err);
//     return { ok: false, error: String(err?.message || err) };
//   }
// }
