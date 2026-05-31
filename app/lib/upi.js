// UPI QR generator. Produces a standard upi://pay URI and renders an SVG QR.
import QRCode from 'qrcode';

const VPA = process.env.UPI_VPA || 'cheaptravels@upi';
const PAYEE = process.env.UPI_PAYEE_NAME || 'Cheap Travels India';

export function upiUri({ amount, orderId }) {
  const params = new URLSearchParams({
    pa: VPA, pn: PAYEE, am: String(amount), cu: 'INR', tn: orderId || '',
  });
  return `upi://pay?${params.toString()}`;
}

export async function upiQrSvg({ amount, orderId }) {
  return QRCode.toString(upiUri({ amount, orderId }), {
    type: 'svg', errorCorrectionLevel: 'M', margin: 1,
    color: { dark: '#0E7B4F', light: '#FFFFFF' },
    width: 256,
  });
}

export function getVpa() { return VPA; }
