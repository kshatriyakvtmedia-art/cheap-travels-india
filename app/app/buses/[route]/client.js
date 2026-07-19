'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { parseRouteSlug } from '@/lib/route-slug';

export default function BusResultsClient({ route, date }) {
  const { from, to } = parseRouteSlug(route);
  const router = useRouter();
  const [buses, setBuses] = useState(null);
  const [error, setError] = useState(null);
  const [sort, setSort] = useState('departure');

  // Inline seat panel state
  const [activeBus, setActiveBus] = useState(null);
  const [seatLayout, setSeatLayout] = useState(null);
  const [selectedSeat, setSelectedSeat] = useState(null);
  const [boarding, setBoarding] = useState(null);
  const [dropping, setDropping] = useState(null);
  const [creating, setCreating] = useState(false);
  const [seatTab, setSeatTab] = useState('seats');

  useEffect(() => {
    setBuses(null);
    setError(null);
    fetch(`/api/buses?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&date=${date}`)
      .then(r => r.json())
      .then(d => { if (d.error) setError(d.error); else setBuses(d.buses); })
      .catch(e => setError(e.message));
  }, [from, to, date]);

  const sorted = (() => {
    if (!buses) return null;
    const arr = [...buses];
    if (sort === 'price')     arr.sort((a, b) => a.displayedFare - b.displayedFare);
    if (sort === 'departure') arr.sort((a, b) => String(a.departure).localeCompare(String(b.departure)));
    if (sort === 'rating')    arr.sort((a, b) => (b.rating || 0) - (a.rating || 0));
    if (sort === 'duration')  arr.sort((a, b) => (a.durationMins || 0) - (b.durationMins || 0));
    return arr;
  })();

  const openSeats = (bus) => {
    if (activeBus?.externalId === bus.externalId) {
      // Toggle off
      setActiveBus(null);
      setSelectedSeat(null);
      setSeatLayout(null);
      return;
    }
    setActiveBus(bus);
    setSelectedSeat(null);
    setSeatLayout(null);
    setSeatTab('seats');
    setBoarding(bus.boardingPoints?.[0] || null);
    setDropping(bus.droppingPoints?.[0] || null);
    fetch(`/api/seats/${encodeURIComponent(bus.externalId)}?provider=${bus.provider || 'laxmi'}`)
      .then(r => r.json())
      .then(setSeatLayout)
      .catch(() => {});
  };

  const proceed = async () => {
    if (!selectedSeat || !activeBus) return;
    setCreating(true);
    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: activeBus.provider,
          bus_external_id: activeBus.externalId,
          operator: activeBus.operator,
          bus_type: activeBus.busType,
          from_city: from,
          to_city: to,
          journey_date: date,
          departure: activeBus.departure,
          arrival: activeBus.arrival,
          seat_no: selectedSeat,
          boarding_point: boarding?.name || '',
          dropping_point: dropping?.name || '',
          net_fare: activeBus.netFare,
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

  const dateLabel = new Date(date + 'T00:00:00').toLocaleDateString('en-IN', {
    day: 'numeric', month: 'short', weekday: 'short',
  });

  return (
    <div className="bg-brand-surface min-h-screen pb-12">
      {/* Route bar */}
      <div className="bg-brand-green text-white py-4">
        <div className="max-w-7xl mx-auto px-4 flex flex-wrap items-center gap-3">
          <Link href="/" className="text-emerald-100 text-sm hover:text-white">← New search</Link>
          <div className="ml-2 px-3 py-1.5 bg-white/10 rounded-lg text-sm font-semibold">
            {from} → {to} · {dateLabel}
          </div>
          <span className="ml-auto text-xs text-emerald-200">
            {buses ? <><b className="text-white">{buses.length}</b> buses found</> : 'Searching…'}
          </span>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 mt-5">
        {/* Savings strip */}
        <div className="rounded-2xl p-4 md:p-5 flex flex-wrap items-center gap-3 text-white shadow-card mb-5"
             style={{ background: 'linear-gradient(135deg,#0E7B4F,#094B30)' }}>
          <span className="font-head font-bold text-sm flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-brand-orange inline-block" />
            {from} → {to} · Direct from operator
          </span>
          <span className="bg-white/10 border border-white/15 rounded-lg px-3 py-1.5 text-sm">No OTA markup</span>
          {buses?.length > 0 && (
            <span className="ml-auto px-3 py-1.5 rounded-lg bg-brand-orange text-brand-green-d font-bold text-sm">
              Our price ₹{Math.min(...buses.map(b => b.displayedFare)).toLocaleString('en-IN')} incl. 5% member discount
            </span>
          )}
        </div>

        {/* Sort bar */}
        <div className="card flex items-center gap-3 px-4 py-2.5 mb-3 overflow-x-auto">
          <span className="label whitespace-nowrap">Sort:</span>
          {[['departure','Departure ↑'],['price','Price ↑'],['duration','Duration ↑'],['rating','Rating ↓']].map(([k,l]) => (
            <button key={k} onClick={() => setSort(k)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap ${sort === k ? 'bg-brand-green text-white' : 'text-gray-600 hover:bg-gray-100'}`}>
              {l}
            </button>
          ))}
        </div>

        {error && <div className="card p-5 text-red-600 text-sm">Error: {error}</div>}

        {!buses && !error && (
          <div className="space-y-3">
            {[1, 2, 3].map(i => <div key={i} className="card p-6 animate-pulse h-32" />)}
          </div>
        )}

        <div className="space-y-3">
          {sorted?.map((b, i) => (
            <div key={b.externalId}>
              <BusCard
                bus={b}
                featured={i === 0}
                seatsOpen={activeBus?.externalId === b.externalId}
                onViewSeats={() => openSeats(b)}
              />
              {/* Inline seat panel — expands below the bus card */}
              {activeBus?.externalId === b.externalId && (
                <SeatPanel
                  bus={activeBus}
                  layout={seatLayout}
                  selectedSeat={selectedSeat}
                  setSelectedSeat={setSelectedSeat}
                  boarding={boarding}
                  setBoarding={setBoarding}
                  dropping={dropping}
                  setDropping={setDropping}
                  creating={creating}
                  proceed={proceed}
                  seatTab={seatTab}
                  setSeatTab={setSeatTab}
                />
              )}
            </div>
          ))}
        </div>

        {sorted?.length === 0 && (
          <div className="card p-8 text-center text-gray-500 text-sm">
            No buses found for this route and date. Try a nearby date or check the city spelling.
          </div>
        )}
      </div>
    </div>
  );
}

function BusCard({ bus, featured, seatsOpen, onViewSeats }) {
  const lowSeats = bus.seatsAvailable < 10;

  return (
    <div className={`card p-4 md:p-5 grid md:grid-cols-[1fr_auto] gap-4 relative overflow-hidden
      ${featured ? 'border-l-4 border-brand-orange' : ''}
      ${seatsOpen ? 'rounded-b-none border-b-0' : ''}`}>
      {featured && !seatsOpen && (
        <span className="absolute top-0 right-0 bg-brand-orange text-brand-green-d text-[10px] font-extrabold tracking-wider px-3 py-1 rounded-bl-lg">BEST PRICE</span>
      )}
      <div>
        {/* Operator + badge */}
        <div className="flex items-center gap-2 mb-1">
          <h3 className="font-bold text-base md:text-lg">{bus.operator}</h3>
          <span className="chip bg-emerald-50 text-emerald-700 font-bold text-[11px]">Direct Partner 5% Off</span>
        </div>
        <div className="flex flex-wrap gap-1.5 mb-3">
          <span className="chip bg-gray-100 text-gray-600">{bus.busType}</span>
          {(bus.amenities || []).map(a => (
            <span key={a} className="chip bg-gray-100 text-gray-600">{a}</span>
          ))}
        </div>
        {/* Times */}
        <div className="grid grid-cols-[auto_1fr_auto] gap-3 items-center mb-2">
          <div>
            <div className="font-head font-bold text-xl">{bus.departure}</div>
            <div className="text-xs text-gray-500">{bus.boardingPoints?.[0]?.name || from}</div>
          </div>
          <div className="flex flex-col items-center gap-1">
            <span className="chip bg-gray-100 text-gray-600 text-xs">{minsToHr(bus.durationMins)}</span>
            <div className="w-24 h-0.5 bg-gradient-to-r from-brand-green via-brand-orange to-brand-green relative">
              <span className="absolute -left-1 -top-1 w-2 h-2 rounded-full bg-brand-green" />
              <span className="absolute -right-1 -top-1 w-2 h-2 rounded-full bg-brand-green" />
            </div>
          </div>
          <div className="text-right">
            <div className="font-head font-bold text-xl">{bus.arrival}</div>
            <div className="text-xs text-gray-500">{bus.droppingPoints?.[0]?.name || to}</div>
          </div>
        </div>
        <div className="flex items-center gap-3 text-xs">
          {bus.rating && <span className="chip bg-emerald-100 text-emerald-700 font-bold">★ {bus.rating}</span>}
          {bus.ratingCount > 0 && <span className="text-gray-500">{bus.ratingCount.toLocaleString('en-IN')} ratings</span>}
          <span className={lowSeats ? 'text-red-600 font-semibold' : 'text-emerald-600 font-semibold'}>
            {bus.seatsAvailable} seats left
          </span>
        </div>
      </div>
      {/* Price + CTA */}
      <div className="flex md:flex-col justify-between items-end gap-3 md:pl-4 md:border-l border-dashed border-gray-200 md:min-w-[160px]">
        <div className="text-right">
          <div className="text-xs text-gray-400 line-through">₹{bus.strikeFare.toLocaleString('en-IN')}</div>
          <div className="font-head font-extrabold text-2xl text-brand-green-d leading-none">
            ₹{bus.displayedFare.toLocaleString('en-IN')}
          </div>
          <div className="chip bg-emerald-100 text-emerald-700 mt-1 font-bold">
            SAVE ₹{(bus.strikeFare - bus.displayedFare).toLocaleString('en-IN')}
          </div>
        </div>
        <button
          onClick={onViewSeats}
          className={seatsOpen ? 'btn-secondary text-sm py-2.5 px-5' : 'btn-primary text-sm py-2.5 px-5'}>
          {seatsOpen ? 'Hide Seats' : 'View Seats'}
        </button>
      </div>
    </div>
  );
}

// ── Inline seat panel — expands below the bus card, same page ──
function SeatPanel({ bus, layout, selectedSeat, setSelectedSeat, boarding, setBoarding, dropping, setDropping, creating, proceed, seatTab, setSeatTab }) {
  const cols = layout?.cols || 3;

  return (
    <div className="card rounded-t-none border-t border-dashed border-gray-200 overflow-hidden">
      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid #e5e7eb', overflowX: 'auto' }}>
        {[['seats','Seats'],['boarding','Boarding Points'],['dropping','Dropping Points'],['policy','Policy']].map(([k, l]) => (
          <button key={k} onClick={() => setSeatTab(k)} style={{
            padding: '12px 18px', background: 'none', border: 'none',
            borderBottom: seatTab === k ? '2px solid #0E7B4F' : '2px solid transparent',
            color: seatTab === k ? '#0E7B4F' : '#64748b',
            fontWeight: seatTab === k ? 700 : 400,
            fontSize: 14, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
          }}>{l}</button>
        ))}
      </div>

      {/* Body: 2-col on desktop */}
      <div className="grid md:grid-cols-[1fr_320px] gap-0">

        {/* LEFT — seat grid / boarding / dropping / policy */}
        <div style={{ padding: '20px', borderRight: '1px dashed #e5e7eb' }}>

          {seatTab === 'seats' && (
            <div>
              <div style={{ background: '#f8fafc', borderRadius: 14, padding: 20, border: '1.5px dashed #e2e8f0', display: 'inline-block', minWidth: 240 }}>
                <div style={{ textAlign: 'center', fontSize: 11, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1, fontWeight: 700, marginBottom: 10 }}>
                  SEAT LAYOUT
                </div>
                {/* Driver icon */}
                <div style={{ width: 36, height: 14, background: '#cbd5e1', borderRadius: 4, margin: '0 auto 16px' }} />
                {layout ? (
                  <div style={{
                    display: 'grid',
                    gap: 8,
                    gridTemplateColumns: `repeat(${cols}, 1fr)`,
                    gridAutoRows: '64px',
                    maxWidth: cols === 3 ? 220 : cols * 72,
                    margin: '0 auto',
                  }}>
                    {layout.seats.map(s => (
                      <button
                        key={s.no}
                        disabled={s.status === 'booked'}
                        onClick={() => setSelectedSeat(s.no)}
                        className={`seat-btn ${s.status === 'booked' ? 'booked' : ''} ${s.status === 'ladies' ? 'ladies' : ''} ${selectedSeat === s.no ? 'selected' : ''}`}
                        style={{ height: '64px', aspectRatio: 'unset', width: '100%', fontSize: 11, fontWeight: 700 }}
                      >
                        {s.no}
                      </button>
                    ))}
                  </div>
                ) : (
                  <div style={{ textAlign: 'center', color: '#94a3b8', padding: '32px 16px', fontSize: 14 }}>
                    <div style={{ width: 28, height: 28, borderRadius: '50%', border: '3px solid #0E7B4F', borderTopColor: 'transparent', animation: 'spin 0.8s linear infinite', margin: '0 auto 8px' }} />
                    Loading seats…
                  </div>
                )}
                {/* Legend */}
                <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 12, marginTop: 16, fontSize: 11, color: '#64748b' }}>
                  {[['Available',''],['Ladies','ladies'],['Booked','booked'],['Selected','selected']].map(([label, cls]) => (
                    <span key={label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <span className={`seat-btn ${cls}`} style={{ width: 14, height: 14, minHeight: 14, fontSize: 0, padding: 0, pointerEvents: 'none' }} />
                      {label}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}

          {seatTab === 'boarding' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <h4 style={{ fontWeight: 700, fontSize: 14, marginBottom: 4, color: '#0c2e1e' }}>Pick Boarding Point</h4>
              {bus.boardingPoints?.length ? bus.boardingPoints.map(p => (
                <button key={p.id} onClick={() => setBoarding(p)} style={{ textAlign: 'left', padding: 14, borderRadius: 12, border: boarding?.id === p.id ? '2px solid #0E7B4F' : '1.5px solid #e5e7eb', background: boarding?.id === p.id ? '#f0faf4' : '#fff', cursor: 'pointer', width: '100%' }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: '#0c2e1e' }}>{p.name}</div>
                  {p.address && <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>{p.address}</div>}
                  <div style={{ fontSize: 13, color: '#0E7B4F', fontWeight: 700, marginTop: 4 }}>{p.time}</div>
                </button>
              )) : <p style={{ color: '#94a3b8', fontSize: 14 }}>Contact operator for boarding details.</p>}
            </div>
          )}

          {seatTab === 'dropping' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <h4 style={{ fontWeight: 700, fontSize: 14, marginBottom: 4, color: '#0c2e1e' }}>Pick Dropping Point</h4>
              {bus.droppingPoints?.length ? bus.droppingPoints.map(p => (
                <button key={p.id} onClick={() => setDropping(p)} style={{ textAlign: 'left', padding: 14, borderRadius: 12, border: dropping?.id === p.id ? '2px solid #0E7B4F' : '1.5px solid #e5e7eb', background: dropping?.id === p.id ? '#f0faf4' : '#fff', cursor: 'pointer', width: '100%' }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: '#0c2e1e' }}>{p.name}</div>
                  {p.address && <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>{p.address}</div>}
                  <div style={{ fontSize: 13, color: '#0E7B4F', fontWeight: 700, marginTop: 4 }}>{p.time}</div>
                </button>
              )) : <p style={{ color: '#94a3b8', fontSize: 14 }}>Contact operator for dropping details.</p>}
            </div>
          )}

          {seatTab === 'policy' && (
            <div style={{ fontSize: 14, color: '#475569', lineHeight: 1.7 }}>
              <p><strong>Cancellation:</strong> Charges vary by operator. Generally 24h+ cancellations are refundable minus operator fee.</p>
              <p style={{ marginTop: 10 }}><strong>ID proof:</strong> Carry a valid government-issued photo ID at boarding.</p>
              <p style={{ marginTop: 10 }}><strong>Boarding:</strong> Report at boarding point at least 20 minutes before scheduled departure.</p>
            </div>
          )}
        </div>

        {/* RIGHT — pick boarding + fare summary + CTA */}
        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Boarding point quick-pick (always visible on right) */}
          <div>
            <div style={{ fontWeight: 700, fontSize: 13, color: '#0c2e1e', marginBottom: 8 }}>Pick boarding point</div>
            {bus.boardingPoints?.length ? bus.boardingPoints.map(p => (
              <button key={p.id} onClick={() => setBoarding(p)} style={{
                display: 'block', width: '100%', textAlign: 'left',
                padding: '10px 12px', borderRadius: 10, marginBottom: 6,
                border: boarding?.id === p.id ? '2px solid #0E7B4F' : '1.5px solid #e5e7eb',
                background: boarding?.id === p.id ? '#f0faf4' : '#fff',
                cursor: 'pointer',
              }}>
                <div style={{ fontWeight: 700, fontSize: 13, color: '#0c2e1e' }}>{p.name}</div>
                {p.address && <div style={{ fontSize: 11, color: '#64748b', marginTop: 1 }}>Please contact operator for exact boarding point details.</div>}
                <div style={{ fontSize: 12, color: '#0E7B4F', fontWeight: 700, marginTop: 3 }}>{p.time}</div>
              </button>
            )) : (
              <div style={{ fontSize: 13, color: '#94a3b8', padding: '10px 0' }}>Contact operator for boarding details.</div>
            )}
          </div>

          {/* Fare summary box */}
          <div style={{ border: '1.5px solid #e5e7eb', borderRadius: 12, padding: 14, background: '#f8fafc' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}>
              <span style={{ color: '#64748b' }}>Selected seat</span>
              <span style={{ fontWeight: 700, color: selectedSeat ? '#0E7B4F' : '#94a3b8' }}>{selectedSeat || '— none —'}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}>
              <span style={{ color: '#64748b' }}>Others charge</span>
              <span style={{ textDecoration: 'line-through', color: '#94a3b8' }}>₹{bus.strikeFare.toLocaleString('en-IN')}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6, color: '#0E7B4F' }}>
              <span style={{ fontWeight: 600 }}>Cheap Travels saves you</span>
              <span style={{ fontWeight: 700 }}>₹{bus.customerDiscount.toLocaleString('en-IN')}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 10 }}>
              <span style={{ color: '#64748b' }}>Convenience fee</span>
              <span style={{ color: '#64748b' }}>₹0</span>
            </div>
            <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: 10, display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontWeight: 800, fontSize: 15 }}>You pay</span>
              <span style={{ fontWeight: 800, fontSize: 15, color: '#0c2e1e' }}>
                {selectedSeat ? `₹${bus.displayedFare.toLocaleString('en-IN')}` : '₹0'}
              </span>
            </div>
          </div>

          {/* CTA */}
          <button
            onClick={proceed}
            disabled={!selectedSeat || creating}
            style={{
              width: '100%', padding: '15px 16px', borderRadius: 12,
              background: (!selectedSeat || creating) ? '#e2e8f0' : 'linear-gradient(135deg,#EE8C2E,#d97706)',
              color: (!selectedSeat || creating) ? '#94a3b8' : '#1a3c25',
              border: 'none', fontWeight: 800, fontSize: 15,
              cursor: (!selectedSeat || creating) ? 'not-allowed' : 'pointer',
              boxShadow: (!selectedSeat || creating) ? 'none' : '0 4px 16px rgba(238,140,46,0.4)',
              transition: 'all 0.15s',
            }}>
            {creating ? 'Holding seat…' : selectedSeat ? 'Continue to Passenger Details →' : 'Select a seat to continue'}
          </button>
          <p style={{ fontSize: 11, color: '#94a3b8', textAlign: 'center', marginTop: -4 }}>
            Seat held for 8 min · Confirmed after payment
          </p>
        </div>

      </div>
    </div>
  );
}

function minsToHr(m) {
  if (!m) return '';
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}
