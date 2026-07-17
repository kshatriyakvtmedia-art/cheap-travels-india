'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';

export default function PassengerDetailsPage() {
  const { bookingId } = useParams();
  const router = useRouter();
  const [order, setOrder] = useState(null);
  const [form, setForm] = useState({ name: '', age: '', gender: 'Male', phone: '', email: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [remaining, setRemaining] = useState(0);

  useEffect(() => {
    fetch(`/api/orders/${bookingId}`)
      .then(r => r.json())
      .then(o => {
        if (o.error) { setError(o.error); return; }
        setOrder(o);
        const heldUntil = new Date(o.held_until).getTime();
        setRemaining(Math.max(0, Math.floor((heldUntil - Date.now()) / 1000)));
        // Pre-fill if passenger details already saved
        if (o.passenger_name) setForm({
          name: o.passenger_name || '',
          age: o.passenger_age || '',
          gender: o.passenger_gender || 'Male',
          phone: o.customer_phone || '',
          email: o.customer_email || '',
        });
      });
  }, [bookingId]);

  useEffect(() => {
    if (remaining <= 0) return;
    const t = setInterval(() => setRemaining(r => Math.max(0, r - 1)), 1000);
    return () => clearInterval(t);
  }, [remaining]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      const res = await fetch(`/api/orders/${bookingId}/passenger`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (data.ok) {
        router.push(`/payment/${bookingId}`);
      } else {
        setError(data.error || 'Failed to save details. Please try again.');
        setSaving(false);
      }
    } catch (err) {
      setError('Network error — please check your connection and try again.');
      setSaving(false);
    }
  };

  if (!order && !error) {
    return (
      <div className="max-w-4xl mx-auto p-8 text-gray-500 flex flex-col items-center gap-3">
        <div className="w-10 h-10 rounded-full border-4 border-brand-green border-t-transparent animate-spin" />
        Loading your booking...
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

  return (
    <div className="bg-brand-surface min-h-screen pb-12">
      <div className="bg-brand-green text-white py-4">
        <div className="max-w-7xl mx-auto px-4 flex flex-wrap items-center gap-3 text-sm">
          <button onClick={() => router.back()} className="text-emerald-100 hover:text-white">← Back</button>
          <span>{order.from_city} → {order.to_city} · {order.journey_date} · {order.operator} · Seat {order.seat_no}</span>
          {!expired && (
            <span className="ml-auto inline-flex items-center gap-1.5 bg-red-500/20 text-white px-3 py-1 rounded-full text-xs font-semibold">
              ⏱ Hold expires {mins}:{secs}
            </span>
          )}
        </div>
      </div>

      {/* Step indicator */}
      <div className="max-w-3xl mx-auto px-4 pt-5">
        <div className="flex items-center gap-2 text-sm mb-6">
          <Step n={1} label="Passenger details" active />
          <div className="flex-1 h-0.5 bg-gray-200" />
          <Step n={2} label="Payment" />
          <div className="flex-1 h-0.5 bg-gray-200" />
          <Step n={3} label="Confirmation" />
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 grid md:grid-cols-[1fr_300px] gap-5">
        <div>
          {expired && (
            <div className="card p-4 bg-red-50 border border-red-200 text-red-700 text-sm mb-4">
              Your seat hold has expired. Please go back and select a seat again.
            </div>
          )}

          <form onSubmit={handleSubmit} className="card p-5">
            <h3 className="font-head font-bold text-base text-brand-green-d mb-4">
              Passenger details
            </h3>

            {error && <div className="text-red-600 text-sm mb-3">{error}</div>}

            <div className="grid md:grid-cols-2 gap-3">
              <div className="md:col-span-2">
                <label className="label mb-1">Full name *</label>
                <input className="input" placeholder="e.g. Rakesh Yadav"
                  value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required />
              </div>
              <div>
                <label className="label mb-1">Age</label>
                <input className="input" type="number" min="1" max="120"
                  value={form.age} onChange={e => setForm({ ...form, age: e.target.value })} />
              </div>
              <div>
                <label className="label mb-1">Gender</label>
                <select className="input" value={form.gender} onChange={e => setForm({ ...form, gender: e.target.value })}>
                  <option>Male</option><option>Female</option><option>Other</option>
                </select>
              </div>
              <div className="md:col-span-2">
                <label className="label mb-1">Mobile (for WhatsApp ticket) *</label>
                <input className="input" type="tel" placeholder="+91 9XXXXX XXXXX"
                  value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} required />
              </div>
              <div className="md:col-span-2">
                <label className="label mb-1">Email</label>
                <input className="input" type="email" placeholder="you@example.com"
                  value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
              </div>
            </div>

            <button type="submit" disabled={saving || expired}
              className="btn-primary w-full mt-5 disabled:bg-gray-200 disabled:text-gray-400 disabled:shadow-none">
              {saving ? 'Saving...' : 'Continue to payment →'}
            </button>
          </form>
        </div>

        {/* Trip summary sidebar */}
        <aside className="space-y-3">
          <div className="card p-5">
            <h4 className="font-bold text-brand-green-d mb-3 pb-2 border-b border-gray-100">Trip summary</h4>
            <Sum l="Operator" v={order.operator} />
            <Sum l="Bus type" v={order.bus_type} />
            <Sum l="Departure" v={`${order.journey_date}, ${order.departure}`} />
            <Sum l="Arrival" v={order.arrival} />
            <Sum l="Boarding" v={order.boarding_point} />
            <Sum l="Seat" v={order.seat_no} />
          </div>
          <div className="card p-5">
            <h4 className="font-bold text-brand-green-d mb-3 pb-2 border-b border-gray-100">Fare breakup</h4>
            <Sum l="Base fare" v={`₹${Number(order.base_fare + order.our_margin + order.customer_discount).toLocaleString('en-IN')}`} />
            <Sum l="Cheap Travels discount" v={`− ₹${Number(order.customer_discount).toLocaleString('en-IN')}`} green />
            <Sum l="Convenience fee" v="₹0" />
            <div className="flex justify-between font-head font-extrabold text-brand-green-d text-lg mt-2 pt-2 border-t border-dashed border-gray-200">
              <span>Total payable</span><span>₹{Number(order.total_payable).toLocaleString('en-IN')}</span>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

const Step = ({ n, label, active }) => (
  <div className={`flex items-center gap-2 ${active ? 'text-brand-green' : 'text-gray-400'}`}>
    <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 ${active ? 'bg-brand-green text-white border-brand-green' : 'border-gray-300'}`}>{n}</span>
    <span className="text-sm font-medium hidden sm:inline">{label}</span>
  </div>
);
const Sum = ({ l, v, green }) => (
  <div className={`flex justify-between text-sm mb-1.5 ${green ? 'text-emerald-600 font-semibold' : ''}`}>
    <span className="text-gray-500">{l}</span><span>{v}</span>
  </div>
);
