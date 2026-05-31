// WhatsApp Business sender via AiSensy / Wati (both accept the same template-message format).
// Falls back to console.log when WHATSAPP_API_KEY is not set.

const API_URL = process.env.WHATSAPP_API_URL || '';
const API_KEY = process.env.WHATSAPP_API_KEY || '';
const TEMPLATE = process.env.WHATSAPP_TEMPLATE_NAME || 'ticket_confirmation';

export function isConfigured() {
  return !!(API_URL && API_KEY);
}

/**
 * Send the branded ticket confirmation. The Meta-approved template should have
 * placeholders for {1}=passenger name, {2}=PNR, {3}=route, {4}=date+time.
 */
export async function sendTicket({ phone, name, pnr, route, dateTime, ticketUrl }) {
  if (!isConfigured()) {
    console.log('[whatsapp:mock]', { phone, name, pnr, route, dateTime, ticketUrl });
    return { ok: true, mocked: true };
  }
  const normalised = phone.replace(/\D/g, '').replace(/^0+/, '');
  const e164 = normalised.length === 10 ? '91' + normalised : normalised;

  const payload = {
    apiKey: API_KEY,
    campaignName: TEMPLATE,
    destination: e164,
    userName: name || 'Customer',
    templateParams: [name || 'Customer', pnr, route, dateTime],
    media: ticketUrl ? { url: ticketUrl, filename: `ticket-${pnr}.pdf` } : undefined,
  };

  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.message || `HTTP ${res.status}`);
    return { ok: true, response: data };
  } catch (e) {
    console.error('[whatsapp:error]', e);
    return { ok: false, error: String(e?.message || e) };
  }
}
