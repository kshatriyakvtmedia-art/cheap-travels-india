'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';

export default function Checkout() {
  const { orderId } = useParams();
  const router = useRouter();
  const [order, setOrder] = useState(null);
  const [qrSvg, setQrSvg] = useState('');
  const [form, setForm] = useState({ name: '', age: '', gender: 'Male', phone: '', email: '' });
  const [confirming, setConfirming] = useState(false);
  const [remaining, setRemaining] = useState(0);

  useEffect(() => {
    fetch(`/api/orders/${orderId}`)
      .then(r => r.json())
      .then(o => {
        if (o.error) return alert(o.error);
        setOrder(o);
        const heldUntil = new Date(o.held_until).getTime();
        setRemaining(Math.max(0, Math.floor((heldUntil - Date.now()) / 1000)));
      });
    fetch(`/api/upi?orderId=${orderId}`).then(r => r.text()).then(setQrSvg);
  }, [orderId]);

  useEffect(() => {
    if (remaining <= 0) return;
    const t = setInterval(() => setRemaining(r => Math.max(0, r - 1)), 1000);
    return () => clearInterval(t);
  }, [remaining]);

  const submitPayment = async () => {
    if (!form.name || !form.phone) return alert('Name and mobile are required');
    setConfirming(true);
    // Save passenger details against the order (just patches the held order)
    await fetch(`/api/orders/${orderId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ utr: '' }),
    });
    // In the MVP, customer self-declares payment. Ops will reconcile via admin.
    router.push(`/checkout/${orderId}/waiting`);
  };

  if (!order) return <div className="max-w-4xl mx-auto p-8 text-gray-500">Loading checkout...</div>;

  const fmt = (n) => '₹' + Number(n || 0).toLocaleString('en-IN');
  const mins = String(Math.floor(remaining / 60)).padStart(2, '0');
  const secs = String(remaining % 60).padStart(2, '0');

  return (
    <div className="bg-brand-surface min-h-screen pb-12">
      <div className="bg-brand-green text-white py-4">
        <div className="max-w-7xl mx-auto px-4 flex flex-wrap items-center gap-3 text-sm">
          <button onClick={() => router.back()} className="text-emerald-100 hover:text-white">← Back</button>
          <span>{order.from_city} → {order.to_city} · {order.journey_date} · {order.operator} · Seat {order.seat_no}</span>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 mt-5 grid md:grid-cols-[1.4fr_1fr] gap-5">
        <div className="space-y-4">
          {/* Passenger form */}
          <div className="card p-5">
            <h3 className="font-head font-bold text-base text-brand-green-d mb-3 flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-brand-green text-white inline-flex items-center justify-center text-xs">1</span>
              Passenger details
            </h3>
            <div className="grid md:grid-cols-2 gap-3">
              <Field label="Full name" v={form.name} oc={v => setForm({...form, name: v})} placeholder="e.g. Rakesh Yadav" />
              <Field label="Age" type="number" v={form.age} oc={v => setForm({...form, age: v})} />
              <div>
                <div className="label mb-1">Gender</div>
                <select className="input" value={form.gender} onChange={e => setForm({...form, gender: e.target.value})}>
                  <option>Male</option><option>Female</option><option>Other</option>
                </select>
              </div>
              <Field label="Seat" v={order.seat_no} oc={() => {}} readOnly />
              <div className="md:col-span-2"><Field label="Mobile (for WhatsApp ticket)" v={form.phone} oc={v => setForm({...form, phone: v})} placeholder="+91 9XXXX XXXXX" /></div>
              <div className="md:col-span-2"><Field label="Email" v={form.email} oc={v => setForm({...form, email: v})} placeholder="you@example.com" /></div>
            </div>
          </div>

          {/* UPI QR */}
          <div className="card p-6 text-center border-2 border-dashed border-brand-green">
            <h3 className="font-head font-bold text-base text-brand-green-d mb-1 flex items-center justify-center gap-2">
              <span className="w-6 h-6 rounded-full bg-brand-green text-white inline-flex items-center justify-center text-xs">2</span>
              Pay via UPI
            </h3>
            <p className="text-sm text-gray-500 mb-3">Scan with any UPI app · Pay <b>{fmt(order.total_payable)}</b></p>
            {remaining > 0 && (
              <div className="inline-flex items-center gap-1.5 bg-red-50 text-red-600 px-3 py-1 rounded-full text-xs font-semibold mb-3">
                ⏱ Hold expires in {mins}:{secs}
              </div>
            )}
            <div className="inline-block bg-white p-3 rounded-xl shadow-card mb-3" dangerouslySetInnerHTML={{ __html: qrSvg }} />
            <div className="font-head font-bold text-brand-green-d">{process.env.NEXT_PUBLIC_UPI_VPA || 'cheaptravels@upi'}</div>
            <div className="text-xs text-gray-400 mt-1">Order ID (use as UPI note): <b className="text-brand-green-d">{order.id}</b></div>
            <div className="flex justify-center gap-2 mt-3 text-xs">
              {['GPay','PhonePe','Paytm','BHIM'].map(a => (
                <span key={a} className="px-3 py-2 border border-gray-200 rounded-lg font-semibold text-gray-600 bg-white">{a}</span>
              ))}
            </div>
            <button onClick={submitPayment} disabled={confirming}
              className="mt-5 inline-flex px-7 py-3 bg-brand-green hover:bg-brand-green-d text-white rounded-xl font-bold disabled:opacity-50">
              {confirming ? 'Submitting...' : "I have paid · Confirm booking"}
            </button>
            <p className="text-[11px] text-gray-400 mt-3 max-w-md mx-auto">
              After clicking, our team verifies the payment (usually under 90 seconds) and the operator ticket is auto-issued. Your branded ticket will arrive on WhatsApp/email.
            </p>
          </div>
        </div>

        {/* Summary side */}
        <aside className="space-y-3">
          <div className="card p-5">
            <h4 className="font-bold text-brand-green-d mb-2 pb-2 border-b border-gray-100">Trip summary</h4>
            <Sum l="Operator" v={order.operator} />
            <Sum l="Bus type" v={order.bus_type} />
            <Sum l="Departure" v={`${order.journey_date}, ${order.departure}`} />
            <Sum l="Arrival" v={order.arrival} />
            <Sum l="Boarding" v={order.boarding_point} />
            <Sum l="Seat" v={order.seat_no} />
          </div>
          <div className="card p-5">
            <h4 className="font-bold text-brand-green-d mb-2 pb-2 border-b border-gray-100">Fare breakup</h4>
            <Sum l="Base fare" v={fmt(order.base_fare + order.our_margin + order.customer_discount)} />
            <Sum l="Cheap Travels discount" v={`− ${fmt(order.customer_discount)}`} green />
            <Sum l="GST" v="₹0" />
            <div className="flex justify-between font-head font-extrabold text-brand-green-d text-lg mt-2 pt-2 border-t border-dashed border-gray-200">
              <span>Total payable</span><span>{fmt(order.total_payable)}</span>
            </div>
          </div>
          <div className="rounded-2xl p-5 text-white" style={{ background: 'linear-gradient(135deg,#0E7B4F,#094B30)' }}>
            <h4 className="font-bold mb-1">🛡️ Cheap Travels Promise</h4>
            <p className="text-sm text-emerald-100 leading-relaxed">
              If your ticket isn't issued by the operator within 30 minutes, your full payment is auto-refunded. No questions asked.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}

const Field = ({ label, v, oc, ...rest }) => (
  <div>
    <div className="label mb-1">{label}</div>
    <input className="input" value={v} onChange={e => oc(e.target.value)} {...rest} />
  </div>
);
const Sum = ({ l, v, green }) => (
  <div className={`flex justify-between text-sm mb-1.5 ${green?'text-emerald-600 font-semibold':''}`}><span className="text-gray-500">{l}</span><span>{v}</span></div>
);
