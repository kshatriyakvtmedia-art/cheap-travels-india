'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { parseRouteSlug } from '@/lib/route-slug';

export default function SelectSeatsClient({ route, busId, date }) {
  const { from, to } = parseRouteSlug(route);
  const router = useRouter();
  const [bus, setBus] = useState(null);
  const [layout, setLayout] = useState(null);
  const [selectedSeat, setSelectedSeat] = useState(null);
  const [boarding, setBoarding] = useState(null);
  const [dropping, setDropping] = useState(null);
  const [creating, setCreating] = useState(false);
  const [tab, setTab] = useState('seats');
  const [mobile, setMobile] = useState(false);

  const resultsHref = `/buses/${route}?date=${date}`;

  useEffect(() => {
    const check = () => setMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  useEffect(() => {
    if (!busId) return;
    fetch(`/api/buses?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&date=${date}`)
      .then(r => r.json())
      .then(d => {
        const b = d.buses?.find(x => x.externalId === busId);
        setBus(b || null);
        if (b) {
          setBoarding(b.boardingPoints?.[0] || null);
          setDropping(b.droppingPoints?.[0] || null);
        }
      });
    fetch(`/api/seats/${encodeURIComponent(busId)}`)
      .then(r => r.json())
      .then(setLayout)
      .catch(() => {});
  }, [busId, from, to, date]);

  const proceed = async () => {
    if (!selectedSeat) return;
    setCreating(true);
    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: bus.provider,
          bus_external_id: bus.externalId,
          operator: bus.operator,
          bus_type: bus.busType,
          from_city: from,
          to_city: to,
          journey_date: date,
          departure: bus.departure,
          arrival: bus.arrival,
          seat_no: selectedSeat,
          boarding_point: boarding?.name || '',
          dropping_point: dropping?.name || '',
          net_fare: bus.netFare,
        }),
      });
      const data = await res.json();
      if (data.id) {
        router.push(`/passenger-details/${data.id}`);
      } else {
        alert(data.error || 'Could not hold seat. Please try again.');
        setCreating(false);
      }
    } catch {
      alert('Network error. Please try again.');
      setCreating(false);
    }
  };

  if (!busId) {
    return (
      <div className="max-w-7xl mx-auto p-8 text-center text-gray-500">
        No bus selected. <Link href={resultsHref} className="text-brand-green underline">View results</Link>
      </div>
    );
  }

  if (!bus) {
    return (
      <div className="max-w-7xl mx-auto p-8 flex flex-col items-center gap-3 text-gray-500">
        <div className="w-10 h-10 rounded-full border-4 border-brand-green border-t-transparent animate-spin" />
        Loading bus details…
      </div>
    );
  }

  const SeatGrid = () => (
    <div className="bg-gray-50 rounded-xl p-4 border border-dashed border-gray-200">
      <div className="text-center text-xs text-gray-500 uppercase tracking-wide font-semibold mb-2">
        {layout?.sleeper ? 'Lower Deck' : 'Single Deck'}
      </div>
      <div className="mx-auto w-9 h-4 bg-gray-300 rounded mb-4" />
      {layout ? (
        <div className="grid gap-1.5 max-w-[280px] mx-auto" style={{ gridTemplateColumns: `repeat(${layout.cols || 5}, 1fr)` }}>
          {layout.seats.map(s => (
            <button key={s.no} disabled={s.status === 'booked'}
              onClick={() => setSelectedSeat(s.no)}
              className={`seat-btn ${s.sleeper ? 'sleeper' : ''} ${s.status === 'booked' ? 'booked' : ''} ${s.status === 'ladies' ? 'ladies' : ''} ${selectedSeat === s.no ? 'selected' : ''}`}>
              {s.no}
            </button>
          ))}
        </div>
      ) : <div className="text-center text-gray-400 py-8">Loading seats…</div>}
      <div className="flex flex-wrap justify-center gap-3 mt-4 text-xs text-gray-500">
        <Legend label="Available" />
        <Legend label="Ladies" cls="ladies" />
        <Legend label="Booked" cls="booked" />
        <Legend label="Selected" cls="selected" />
      </div>
    </div>
  );

  // ── Mobile: bottom sheet sliding up from bottom ──
  if (mobile) {
    return (
      <>
        <style>{`@keyframes slideUpSheet{from{transform:translateY(100%)}to{transform:translateY(0)}}`}</style>
        {/* Dark backdrop — tap to go back */}
        <div
          onClick={() => router.back()}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 8999 }}
        />
        {/* Sheet */}
        <div style={{
          position: 'fixed', bottom: 0, left: 0, right: 0,
          background: '#fff', borderRadius: '22px 22px 0 0',
          maxHeight: '92vh', display: 'flex', flexDirection: 'column',
          overflow: 'hidden', zIndex: 9000,
          animation: 'slideUpSheet 0.28s cubic-bezier(0.4,0,0.2,1)',
          boxShadow: '0 -8px 40px rgba(0,0,0,0.3)',
        }}>
          {/* Drag handle + close */}
          <div style={{ padding: '12px 16px 8px', flexShrink: 0, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ width: 40, height: 4, background: '#e2e8f0', borderRadius: 4 }} />
            <button onClick={() => router.back()} style={{ position: 'absolute', right: 16, background: '#f1f5f9', border: 'none', borderRadius: '50%', width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#64748b', fontSize: 18 }}>✕</button>
          </div>

          {/* Bus header */}
          <div style={{ padding: '0 16px 10px', borderBottom: '1px solid #f1f5f9', flexShrink: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 15 }}>{bus.operator}</div>
            <div style={{ fontSize: 12, color: '#64748b' }}>{bus.busType} · {bus.departure} → {bus.arrival} · {from} → {to}</div>
          </div>

          {/* Tabs */}
          <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid #e5e7eb', flexShrink: 0, overflowX: 'auto' }}>
            {[['seats', 'Seats'], ['boarding', 'Boarding'], ['dropping', 'Dropping'], ['policy', 'Policy']].map(([k, l]) => (
              <button key={k} onClick={() => setTab(k)} style={{
                padding: '10px 16px', borderBottom: tab === k ? '2px solid #0E7B4F' : '2px solid transparent',
                color: tab === k ? '#0E7B4F' : '#64748b', fontWeight: tab === k ? 700 : 400,
                background: 'none', border: 'none', borderBottom: tab === k ? '2px solid #0E7B4F' : '2px solid transparent',
                fontSize: 14, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
              }}>{l}</button>
            ))}
          </div>

          {/* Scrollable seat content */}
          <div style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch', overscrollBehavior: 'contain', padding: '12px 16px 200px' }}>
            {tab === 'seats' && <SeatGrid />}

            {tab === 'boarding' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {bus.boardingPoints?.map(p => (
                  <button key={p.id} onClick={() => setBoarding(p)} style={{ textAlign: 'left', padding: 12, borderRadius: 12, border: boarding?.id === p.id ? '2px solid #0E7B4F' : '1.5px solid #e5e7eb', background: boarding?.id === p.id ? '#f0faf4' : '#fff', cursor: 'pointer', width: '100%' }}>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{p.name}</div>
                    <div style={{ fontSize: 12, color: '#64748b' }}>{p.address}</div>
                    <div style={{ fontSize: 12, color: '#0E7B4F', fontWeight: 700 }}>{p.time}</div>
                  </button>
                ))}
              </div>
            )}

            {tab === 'dropping' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {bus.droppingPoints?.map(p => (
                  <button key={p.id} onClick={() => setDropping(p)} style={{ textAlign: 'left', padding: 12, borderRadius: 12, border: dropping?.id === p.id ? '2px solid #0E7B4F' : '1.5px solid #e5e7eb', background: dropping?.id === p.id ? '#f0faf4' : '#fff', cursor: 'pointer', width: '100%' }}>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{p.name}</div>
                    <div style={{ fontSize: 12, color: '#64748b' }}>{p.address}</div>
                    <div style={{ fontSize: 12, color: '#0E7B4F', fontWeight: 700 }}>{p.time}</div>
                  </button>
                ))}
              </div>
            )}

            {tab === 'policy' && (
              <div style={{ fontSize: 14, color: '#475569', lineHeight: 1.6 }}>
                <p><strong>Cancellation:</strong> Charges vary by operator. Generally 24h+ cancellations are refundable minus operator fee.</p>
                <p style={{ marginTop: 8 }}><strong>ID proof:</strong> Carry a valid government-issued photo ID at boarding.</p>
                <p style={{ marginTop: 8 }}><strong>Boarding:</strong> Report at boarding point at least 20 minutes before scheduled departure.</p>
              </div>
            )}
          </div>

          {/* Fixed bottom bar: mini fare summary + proceed */}
          <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: '#fff', borderTop: '1px solid #f1f5f9', padding: '10px 16px calc(10px + env(safe-area-inset-bottom, 0px))', zIndex: 9001 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, fontSize: 12, marginBottom: 8, alignItems: 'center' }}>
              <span style={{ color: '#64748b' }}>Seat: <strong style={{ color: '#0E7B4F' }}>{selectedSeat || '—'}</strong></span>
              <span style={{ color: '#e5e7eb' }}>·</span>
              <span style={{ textDecoration: 'line-through', color: '#94a3b8', fontSize: 11 }}>₹{bus.strikeFare.toLocaleString('en-IN')}</span>
              <span style={{ color: '#e5e7eb' }}>·</span>
              <span style={{ color: '#16a34a', fontWeight: 700 }}>₹{bus.displayedFare.toLocaleString('en-IN')}</span>
              <span style={{ background: '#dcfce7', color: '#15803d', borderRadius: 6, padding: '1px 6px', fontSize: 11, fontWeight: 700 }}>SAVE ₹{bus.customerDiscount.toLocaleString('en-IN')}</span>
            </div>
            <button onClick={proceed} disabled={!selectedSeat || creating} style={{
              width: '100%', padding: '14px 16px', borderRadius: 12,
              background: (!selectedSeat || creating) ? '#e2e8f0' : 'linear-gradient(135deg,#EE8C2E,#d97706)',
              color: (!selectedSeat || creating) ? '#94a3b8' : '#1a3c25',
              border: 'none', fontWeight: 800, fontSize: 15, cursor: (!selectedSeat || creating) ? 'not-allowed' : 'pointer',
              boxShadow: (!selectedSeat || creating) ? 'none' : '0 4px 14px rgba(238,140,46,0.4)',
            }}>
              {creating ? 'Holding seat…' : selectedSeat ? `Continue · ₹${bus.displayedFare.toLocaleString('en-IN')}` : 'Pick a seat to continue'}
            </button>
            <p style={{ fontSize: 11, color: '#94a3b8', textAlign: 'center', marginTop: 4 }}>Seat held for 8 min · No charges until payment</p>
          </div>
        </div>
      </>
    );
  }

  // ── Desktop: full page ──
  return (
    <div className="bg-brand-surface min-h-screen pb-12">
      <div className="bg-brand-green text-white py-4">
        <div className="max-w-7xl mx-auto px-4 flex flex-wrap items-center gap-3">
          <Link href={resultsHref} className="text-emerald-100 text-sm hover:text-white">← Back to results</Link>
          <div className="ml-2 font-semibold">{bus.operator}</div>
          <div className="text-emerald-100/80 text-sm">{bus.busType} · {bus.departure} → {bus.arrival}</div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 mt-5">
        <div className="card p-5">
          <div className="flex gap-5 border-b border-gray-200 mb-5 text-sm overflow-x-auto">
            {[['seats', 'Seats'], ['boarding', 'Boarding'], ['dropping', 'Dropping'], ['policy', 'Policy']].map(([k, l]) => (
              <button key={k} onClick={() => setTab(k)}
                className={`pb-2 border-b-2 whitespace-nowrap ${tab === k ? 'border-brand-green text-brand-green font-bold' : 'border-transparent text-gray-500'}`}>
                {l}
              </button>
            ))}
          </div>

          {tab === 'seats' && (
            <div className="grid md:grid-cols-[1.4fr_1fr] gap-6">
              <SeatGrid />
              <div>
                <h4 className="font-bold text-sm text-brand-green-d mb-3">Boarding point</h4>
                <div className="space-y-2 mb-4 max-h-44 overflow-auto">
                  {bus.boardingPoints?.map(p => (
                    <button key={p.id} onClick={() => setBoarding(p)}
                      className={`w-full text-left px-3 py-2.5 rounded-lg border ${boarding?.id === p.id ? 'border-brand-green bg-brand-green/5' : 'border-gray-200 hover:border-brand-green'} flex justify-between items-center`}>
                      <div>
                        <b className="text-sm block">{p.name}</b>
                        <span className="text-xs text-gray-500">{p.address}</span>
                      </div>
                      <span className="text-brand-green-d font-bold text-sm">{p.time}</span>
                    </button>
                  ))}
                </div>

                <h4 className="font-bold text-sm text-brand-green-d mb-3">Dropping point</h4>
                <div className="space-y-2 mb-4 max-h-32 overflow-auto">
                  {bus.droppingPoints?.map(p => (
                    <button key={p.id} onClick={() => setDropping(p)}
                      className={`w-full text-left px-3 py-2.5 rounded-lg border ${dropping?.id === p.id ? 'border-brand-green bg-brand-green/5' : 'border-gray-200 hover:border-brand-green'} flex justify-between items-center`}>
                      <div>
                        <b className="text-sm block">{p.name}</b>
                        <span className="text-xs text-gray-500">{p.address}</span>
                      </div>
                      <span className="text-brand-green-d font-bold text-sm">{p.time}</span>
                    </button>
                  ))}
                </div>

                <div className="bg-brand-surface border border-gray-200 rounded-xl p-3 text-sm space-y-1.5">
                  <Row l="Selected seat" v={selectedSeat || '— none —'} />
                  <Row l="Base fare" v={`₹${bus.strikeFare.toLocaleString('en-IN')}`} />
                  <Row l="Cheap Travels discount (5%)" v={`− ₹${bus.customerDiscount.toLocaleString('en-IN')}`} green />
                  <Row l="Convenience fee" v="₹0" />
                  <div className="flex justify-between border-t border-gray-200 pt-2 mt-2 font-bold text-brand-green-d">
                    <span>Payable</span>
                    <span>₹{bus.displayedFare.toLocaleString('en-IN')}</span>
                  </div>
                </div>

                <button onClick={proceed} disabled={!selectedSeat || creating}
                  className="btn-primary w-full mt-4 disabled:bg-gray-200 disabled:text-gray-400 disabled:shadow-none">
                  {creating ? 'Holding seat…' : selectedSeat ? `Continue · ₹${bus.displayedFare}` : 'Pick a seat to continue'}
                </button>
                <p className="text-[11px] text-gray-400 mt-2 text-center">Seat held for 8 minutes. Booking happens after payment.</p>
              </div>
            </div>
          )}

          {tab === 'boarding' && (
            <div className="space-y-2">
              {bus.boardingPoints?.map(p => <PointCard key={p.id} p={p} />) || <p className="text-sm text-gray-500">No boarding points.</p>}
            </div>
          )}
          {tab === 'dropping' && (
            <div className="space-y-2">
              {bus.droppingPoints?.map(p => <PointCard key={p.id} p={p} />) || <p className="text-sm text-gray-500">No dropping points.</p>}
            </div>
          )}
          {tab === 'policy' && (
            <div className="text-sm text-gray-600 space-y-2 max-w-lg">
              <p><b>Cancellation:</b> Charges vary by operator. Generally 24h+ cancellations are refundable minus operator fee.</p>
              <p><b>ID proof:</b> Carry a valid government-issued photo ID at boarding.</p>
              <p><b>Boarding:</b> Report at boarding point at least 20 minutes before scheduled departure.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const Legend = ({ label, cls = '' }) => (
  <span className="flex items-center gap-1.5">
    <span className={`w-3.5 h-3.5 rounded border ${cls === 'booked' ? 'bg-gray-200 border-gray-200' : cls === 'selected' ? 'bg-brand-green border-brand-green' : cls === 'ladies' ? 'border-pink-500' : 'border-gray-300 bg-white'}`} />
    {label}
  </span>
);
const Row = ({ l, v, green }) => (
  <div className={`flex justify-between ${green ? 'text-emerald-600 font-semibold' : ''}`}>
    <span>{l}</span><span>{v}</span>
  </div>
);
const PointCard = ({ p }) => (
  <div className="card px-4 py-3 flex justify-between items-center">
    <div><b className="text-sm">{p.name}</b><span className="text-xs text-gray-500 block">{p.address}</span></div>
    <span className="text-brand-green-d font-bold text-sm">{p.time}</span>
  </div>
);
