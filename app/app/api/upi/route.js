import { upiQrSvg } from '@/lib/upi.js';
import { getOrder } from '@/lib/db.js';

export const runtime = 'nodejs';

export async function GET(req) {
  const orderId = new URL(req.url).searchParams.get('orderId');
  const o = orderId ? getOrder(orderId) : null;
  const amount = o ? o.total_payable : Number(new URL(req.url).searchParams.get('amount') || 100);
  const svg = await upiQrSvg({ amount, orderId: orderId || '' });
  return new Response(svg, { headers: { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'no-store' } });
}
