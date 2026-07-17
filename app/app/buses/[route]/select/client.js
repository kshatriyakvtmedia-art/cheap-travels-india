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

  const resultsHref = `/buses/${route}?date=${date}`;

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
          {/* Tabs */}
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
              {/* Seat map */}
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

              {/* Right column */}
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

                {/* Fare summary */}
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
