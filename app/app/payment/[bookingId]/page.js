'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';

export default function PaymentPage() {
  const { bookingId } = useParams();
  const router = useRouter();
  const [order, setOrder] = useState(null);
  const [qrSvg, setQrSvg] = useState('');
  const [remaining, setRemaining] = useState(0);
  const [confirming, setConfirming] = useState(false);
  const [polling, setPolling] = useState(false);
  const [status, setStatus] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch(`/api/orders/${bookingId}`)
      .then(r => r.json())
      .then(o => {
        if (o.error) { setError(o.error); return; }
        // Redirect back if passenger details missing
        if (!o.passenger_name || !o.customer_phone) {
          router.replace(`/passenger-details/${bookingId}`);
          return;
        }
        setOrder(o);
        setStatus(o.status);
        const heldUntil = new Date(o.held_until).getTime();
        setRemaining(Math.max(0, Math.floor((heldUntil - Date.now()) / 1000)));
      });
    fetch(`/api/upi?orderId=${bookingId}`).then(r => r.text()).then(setQrSvg);
  }, [bookingId, router]);

  useEffect(() => {
    if (remaining <= 0) return;
    const t = setInterval(() => setRemaining(r => Math.max(0, r - 1)), 1000);
    return () => clearInterval(t);
  }, [remaining]);

  // Poll for confirmation after payment is declared
  useEffect(() => {
    if (!polling) return;
    const id = setInterval(async () => {
      const o = await fetch(`/api/orders/${bookingId}`).then(r => r.json());
      setStatus(o.status);
      if (o.status === 'confirmed' || o.status === 'failed') {
        clearInterval(id);
        setPolling(false);
        router.push(`/booking/${bookingId}`);
      }
    }, 4000);
    return () => clearInterval(id);
  }, [polling, bookingId, router]);

  const declarePayment = async () => {
    setConfirming(true);
    const res = await fetch(`/api/orders/${bookingId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ utr: '' }),
    });
    const data = await res.json();
    if (data.ok) {
      setPolling(true);
    } else {
      setError(data.error || 'Failed to submit payment. Please try again.');
      setConfirming(false);
    }
  };

  if (!order && !error) {
    return (
      <div className="max-w-4xl mx-auto p-8 text-gray-500 flex flex-col items-center gap-3">
        <div className="w-10 h-10 rounded-full border-4 border-brand-green border-t-transparent animate-spin" />
        Loading payment details...
      </div>
    );
  }
  if (error && !order) {
    return (
      <div className="max-w-4xl mx-auto p-8 text-center">
        <div className="text-red-600 mb-3">{error}</div>
        <Link href="/" className="btn-secondary px-5">Go home</Link>
      </div>
    );
  }

  const mins = String(Math.floor(remaining / 60)).padStart(2, '0');
  const secs = String(remaining % 60).padStart(2, '0');
  const expired = remaining <= 0;
  const fmt = n => '₹' + Number(n || 0).toLocaleString('en-IN');

  // Waiting for confirmation after declaring payment
  if (polling) {
    return (
      <div className="bg-brand-surface min-h-screen flex items-center justify-center px-4">
        <div className="card max-w-md w-full p-8 text-center">
          <div className="w-16 h-16 rounded-full border-4 border-brand-green border-t-transparent animate-spin mx-auto mb-4" />
          <h2 className="font-head font-bold text-lg text-brand-green-d">Verifying payment & issuing ticket</h2>
          <p className="text-sm text-gray-500 mt-2 mb-1">This usually takes under 90 seconds.</p>
          <p className="text-sm text-gray-500">Don't close this window — you'll be redirected automatically.</p>
          <p className="text-xs text-gray-400 mt-4">Order ID: <b>{bookingId}</b></p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-brand-surface min-h-screen pb-12">
      <div className="bg-brand-green text-white py-4">
        <div className="max-w-7xl mx-auto px-4 flex flex-wrap items-center gap-3 text-sm">
          <Link href={`/passenger-details/${bookingId}`} className="text-emerald-100 hover:text-white">← Edit passenger</Link>
          <span>{order.from_city} → {order.to_city} · {order.journey_date} · Seat {order.seat_no}</span>
          {!expired && (
            <span className="ml-auto inline-flex items-center gap-1.5 bg-red-500/20 text-white px-3 py-1 rounded-full text-xs font-semibold">
              ⏱ {mins}:{secs}
            </span>
          )}
        </div>
      </div>

      {/* Step indicator */}
      <div className="max-w-3xl mx-auto px-4 pt-5">
        <div className="flex items-center gap-2 text-sm mb-6">
          <Step n={1} label="Passenger details" done />
          <div className="flex-1 h-0.5 bg-brand-green" />
          <Step n={2} label="Payment" active />
          <div className="flex-1 h-0.5 bg-gray-200" />
          <Step n={3} label="Confirmation" />
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 grid md:grid-cols-[1fr_280px] gap-5">
        <div className="space-y-4">
          {expired && (
            <div className="card p-4 bg-red-50 border border-red-200 text-red-700 text-sm">
              Your seat hold has expired. <Link href="/" className="underline font-semibold">Search again</Link>
            </div>
          )}

          {/* Passenger summary */}
          <div className="card p-4">
            <div className="text-xs text-gray-500 uppercase tracking-wide font-semibold mb-2">Travelling as</div>
            <div className="font-bold">{order.passenger_name} · {order.passenger_gender} · {order.passenger_age ? `${order.passenger_age} yrs` : ''}</div>
            <div className="text-sm text-gray-500 mt-0.5">{order.customer_phone} · {order.customer_email || '—'}</div>
          </div>

          {/* UPI QR */}
          <div className="card p-6 text-center border-2 border-dashed border-brand-green">
            <h3 className="font-head font-bold text-base text-brand-green-d mb-1">Pay via UPI</h3>
            <p className="text-sm text-gray-500 mb-4">Scan with any UPI app · Pay <b>{fmt(order.total_payable)}</b></p>

            <div className="inline-block bg-white p-3 rounded-xl shadow-card mb-3" dangerouslySetInnerHTML={{ __html: qrSvg }} />
            <div className="font-head font-bold text-brand-green-d">{process.env.NEXT_PUBLIC_UPI_VPA || 'cheaptravels@upi'}</div>
            <div className="text-xs text-gray-400 mt-1">Use Order ID as UPI note: <b className="text-brand-green-d">{order.id}</b></div>

            <div className="flex justify-center gap-2 mt-3 text-xs flex-wrap">
              {['GPay', 'PhonePe', 'Paytm', 'BHIM'].map(a => (
                <span key={a} className="px-3 py-2 border border-gray-200 rounded-lg font-semibold text-gray-600 bg-white">{a}</span>
              ))}
            </div>

            {error && <div className="text-red-600 text-sm mt-3">{error}</div>}

            <button onClick={declarePayment} disabled={confirming || expired}
              className="mt-5 inline-flex px-7 py-3 bg-brand-green hover:bg-brand-green-d text-white rounded-xl font-bold disabled:opacity-50 transition-colors">
              {confirming ? 'Submitting...' : 'I have paid · Confirm booking'}
            </button>
            <p className="text-[11px] text-gray-400 mt-3 max-w-sm mx-auto leading-relaxed">
              After clicking, our team verifies the payment (usually under 90 seconds) and the operator ticket is issued. Your e-ticket arrives on WhatsApp and email.
            </p>
          </div>

          {/* Promise */}
          <div className="rounded-2xl p-5 text-white" style={{ background: 'linear-gradient(135deg,#0E7B4F,#094B30)' }}>
            <h4 className="font-bold mb-1">🛡️ Cheap Travels Promise</h4>
            <p className="text-sm text-emerald-100 leading-relaxed">
              If your ticket isn't issued by the operator within 30 minutes of confirmed payment, your full amount is auto-refunded. No questions asked.
            </p>
          </div>
        </div>

        {/* Fare sidebar */}
        <aside className="space-y-3">
          <div className="card p-5">
            <h4 className="font-bold text-brand-green-d mb-3 pb-2 border-b border-gray-100">Trip summary</h4>
            <Sum l="Operator" v={order.operator} />
            <Sum l="Bus type" v={order.bus_type} />
            <Sum l="Departure" v={`${order.journey_date}, ${order.departure}`} />
            <Sum l="Boarding" v={order.boarding_point} />
            <Sum l="Seat" v={order.seat_no} />
          </div>
          <div className="card p-5">
            <h4 className="font-bold text-brand-green-d mb-3 pb-2 border-b border-gray-100">Fare breakup</h4>
            <Sum l="Base fare" v={fmt(order.base_fare + order.our_margin + order.customer_discount)} />
            <Sum l="Discount" v={`− ${fmt(order.customer_discount)}`} green />
            <Sum l="Convenience fee" v="₹0" />
            <div className="flex justify-between font-head font-extrabold text-brand-green-d text-lg mt-2 pt-2 border-t border-dashed border-gray-200">
              <span>Total payable</span><span>{fmt(order.total_payable)}</span>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

const Step = ({ n, label, active, done }) => (
  <div className={`flex items-center gap-2 ${active ? 'text-brand-green' : done ? 'text-brand-green' : 'text-gray-400'}`}>
    <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 ${active ? 'bg-brand-green text-white border-brand-green' : done ? 'bg-brand-green text-white border-brand-green' : 'border-gray-300'}`}>
      {done ? '✓' : n}
    </span>
    <span className="text-sm font-medium hidden sm:inline">{label}</span>
  </div>
);
const Sum = ({ l, v, green }) => (
  <div className={`flex justify-between text-sm mb-1.5 ${green ? 'text-emerald-600 font-semibold' : ''}`}>
    <span className="text-gray-500">{l}</span><span>{v}</span>
  </div>
);
