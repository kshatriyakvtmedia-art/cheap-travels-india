'use client';
import { useEffect, useState } from 'react';

export default function Admin() {
  const [token, setToken] = useState(typeof window !== 'undefined' ? localStorage.getItem('ct-admin-token') || '' : '');
  const [orders, setOrders] = useState(null);
  const [filter, setFilter] = useState('paid_pending');
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState('');

  const load = async (t = token, f = filter) => {
    if (!t) return;
    const res = await fetch(`/api/admin/orders?token=${encodeURIComponent(t)}&status=${f}`);
    const d = await res.json();
    if (d.error) { setMsg(d.error); return; }
    setOrders(d.orders);
    setMsg('');
  };

  useEffect(() => { if (token) { localStorage.setItem('ct-admin-token', token); load(token, filter); } }, [token, filter]);

  const reconcile = async (id) => {
    setBusy(id); setMsg('');
    const res = await fetch(`/api/admin/reconcile/${id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-token': token },
    });
    const d = await res.json();
    setBusy(null);
    if (d.ok) { setMsg(`✓ Order ${id} confirmed — PNR ${d.pnr}`); load(); }
    else { setMsg(`✗ ${d.error || 'reconcile failed'}`); }
  };

  if (!token) {
    return (
      <div className="max-w-md mx-auto p-8">
        <div className="card p-6">
          <h2 className="font-head font-bold text-lg mb-1">Admin login</h2>
          <p className="text-xs text-gray-500 mb-4">Enter the ADMIN_TOKEN from your server's .env</p>
          <input className="input" placeholder="ADMIN_TOKEN" onKeyDown={e => e.key === 'Enter' && setToken(e.target.value)} />
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-4 md:p-6">
      <div className="flex items-center gap-3 mb-4">
        <h1 className="font-head font-bold text-xl text-brand-green-d">Admin · Order reconciliation</h1>
        <div className="ml-auto flex gap-2 text-sm">
          {['paid_pending','held','confirmed','failed',''].map(s => (
            <button key={s} onClick={() => setFilter(s)}
              className={`px-3 py-1.5 rounded-lg ${filter===s?'bg-brand-green text-white':'bg-white border border-gray-200'}`}>
              {s || 'All'}
            </button>
          ))}
          <button onClick={() => { localStorage.removeItem('ct-admin-token'); setToken(''); }} className="text-red-600 px-2">Logout</button>
        </div>
      </div>

      {msg && <div className="card p-3 mb-3 text-sm">{msg}</div>}

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-brand-surface text-left text-xs uppercase tracking-wider text-gray-500">
            <tr>
              <th className="p-3">Order</th>
              <th className="p-3">Route</th>
              <th className="p-3">Operator</th>
              <th className="p-3">Passenger / Phone</th>
              <th className="p-3 text-right">₹ Total</th>
              <th className="p-3">Status</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {!orders && <tr><td className="p-6 text-gray-400" colSpan={7}>Loading...</td></tr>}
            {orders?.length === 0 && <tr><td className="p-6 text-gray-400 text-center" colSpan={7}>No orders in this status.</td></tr>}
            {orders?.map(o => (
              <tr key={o.id} className="border-t border-gray-100">
                <td className="p-3"><b>{o.id}</b><div className="text-xs text-gray-400">{(o.created_at || '').slice(0, 16)}</div></td>
                <td className="p-3">{o.from_city} → {o.to_city}<div className="text-xs text-gray-400">{o.journey_date} · {o.departure}</div></td>
                <td className="p-3">{o.operator}<div className="text-xs text-gray-400">Seat {o.seat_no}</div></td>
                <td className="p-3">{o.passenger_name || '—'}<div className="text-xs text-gray-400">{o.customer_phone || ''}</div></td>
                <td className="p-3 text-right font-bold">₹{o.total_payable.toLocaleString('en-IN')}</td>
                <td className="p-3">
                  <span className={`chip ${
                    o.status==='confirmed'?'bg-emerald-100 text-emerald-700':
                    o.status==='paid_pending'?'bg-amber-100 text-amber-800':
                    o.status==='held'?'bg-gray-100 text-gray-700':
                    o.status==='failed'?'bg-red-100 text-red-700':'bg-gray-100 text-gray-700'
                  }`}>{o.status}</span>
                  {o.provider_pnr && <div className="text-xs text-gray-500 mt-1">PNR {o.provider_pnr}</div>}
                </td>
                <td className="p-3 text-right">
                  {o.status === 'paid_pending' && (
                    <button onClick={() => reconcile(o.id)} disabled={busy === o.id}
                      className="px-3 py-1.5 bg-brand-orange text-brand-green-d rounded-lg font-bold text-xs disabled:opacity-50">
                      {busy === o.id ? 'Booking...' : 'Reconcile & Issue'}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-gray-400 mt-3">
        Reconcile only after verifying the UPI payment came in for this order ID. The system will then book the seat on the provider portal and push the ticket to the customer.
      </p>
    </div>
  );
}
