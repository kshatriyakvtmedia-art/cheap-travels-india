'use client';
import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';

function ResultsContent() {
  const sp = useSearchParams();
  const from = sp.get('from') || 'Azamgarh';
  const to = sp.get('to') || 'Delhi';
  const date = sp.get('date') || new Date().toISOString().slice(0, 10);

  const [buses, setBuses] = useState(null);
  const [error, setError] = useState(null);
  const [sort, setSort] = useState('departure');

  useEffect(() => {
    setBuses(null); setError(null);
    fetch(`/api/buses?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&date=${date}`)
      .then(r => r.json())
      .then(d => { if (d.error) setError(d.error); else setBuses(d.buses); })
      .catch(e => setError(e.message));
  }, [from, to, date]);

  const sorted = (() => {
    if (!buses) return null;
    const arr = [...buses];
    if (sort === 'price') arr.sort((a, b) => a.displayedFare - b.displayedFare);
    if (sort === 'departure') arr.sort((a, b) => String(a.departure).localeCompare(String(b.departure)));
    if (sort === 'rating') arr.sort((a, b) => (b.rating || 0) - (a.rating || 0));
    if (sort === 'duration') arr.sort((a, b) => (a.durationMins || 0) - (b.durationMins || 0));
    return arr;
  })();

  return (
    <div className="bg-brand-surface min-h-screen pb-12">
      {/* Search summary bar */}
      <div className="bg-brand-green text-white py-4">
        <div className="max-w-7xl mx-auto px-4 flex flex-wrap items-center gap-3">
          <Link href="/" className="text-emerald-100 text-sm hover:text-white">← New search</Link>
          <div className="ml-2 px-3 py-1.5 bg-white/10 rounded-lg text-sm">
            <b>{from}</b> → <b>{to}</b> · {new Date(date + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', weekday: 'short' })}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 mt-5">
        {/* Live compare strip */}
        <div className="rounded-2xl p-4 md:p-5 flex flex-wrap items-center gap-3 text-white shadow-card mb-5"
             style={{ background: 'linear-gradient(135deg, #0E7B4F, #094B30)' }}>
          <span className="font-head font-bold text-sm flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-brand-orange live-dot inline-block"></span>
            Live rate-compare · {from} → {to}
          </span>
          <Cmp name="RedBus" price={1499} />
          <Cmp name="AbhiBus" price={1480} />
          <Cmp name="MMT" price={1520} />
          <span className="ml-auto px-3 py-1.5 rounded-lg bg-brand-orange text-brand-green-d font-bold text-sm">
            CheapTravels lowest · save up to 30%
          </span>
        </div>

        {/* Sort tabs */}
        <div className="card flex items-center gap-3 px-4 py-2.5 mb-3">
          <span className="label">Sort:</span>
          {['departure', 'price', 'duration', 'rating'].map(k => (
            <button key={k} onClick={() => setSort(k)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium ${sort === k ? 'bg-brand-green text-white' : 'text-gray-600 hover:bg-gray-100'}`}>
              {k[0].toUpperCase() + k.slice(1)}
            </button>
          ))}
          <span className="ml-auto text-sm text-gray-500">
            {buses ? <><b className="text-brand-green-d">{buses.length}</b> buses found</> : 'Searching...'}
          </span>
        </div>

        {error && <div className="card p-5 text-red-600 text-sm">Error: {error}</div>}

        {!buses && !error && (
          <div className="space-y-3">{[1, 2, 3].map(i => <div key={i} className="card p-6 animate-pulse h-32" />)}</div>
        )}

        <div className="space-y-3">
          {sorted?.map((b, i) => (
            <BusCard key={b.externalId} bus={b} featured={i === 0} from={from} to={to} date={date} />
          ))}
        </div>

        {sorted && sorted.length === 0 && (
          <div className="card p-8 text-center text-gray-500 text-sm">
            No buses found for this route and date. Try a nearby date or check the city spelling.
          </div>
        )}
      </div>
    </div>
  );
}

export default function ResultsPage() {
  return (
    <Suspense fallback={<div className="bg-brand-surface min-h-screen p-5 flex items-center justify-center text-gray-500">Searching buses...</div>}>
      <ResultsContent />
    </Suspense>
  );
}

function Cmp({ name, price }) {
  return (
    <span className="bg-white/10 border border-white/15 rounded-lg px-3 py-1.5 text-sm">
      <b className="text-brand-orange-s mr-1.5">{name}</b>₹{price.toLocaleString('en-IN')}
    </span>
  );
}

function BusCard({ bus, featured, from, to, date }) {
  const lowSeats = bus.seatsAvailable < 10;
  return (
    <div className={`card p-4 md:p-5 grid md:grid-cols-[1fr_auto] gap-4 relative overflow-hidden ${featured ? 'border-l-4 border-brand-orange' : ''}`}>
      {featured && (
        <span className="absolute top-0 right-0 bg-brand-orange text-brand-green-d text-[10px] font-extrabold tracking-wider px-3 py-1 rounded-bl-lg">BEST PRICE</span>
      )}
      <div>
        <h3 className="font-bold text-base md:text-lg">{bus.operator}</h3>
        <div className="flex flex-wrap gap-1.5 mt-2 mb-3">
          <span className="chip bg-gray-100 text-gray-600">{bus.busType}</span>
          {(bus.amenities || []).map(a => (
            <span key={a} className="chip bg-gray-100 text-gray-600">{a}</span>
          ))}
        </div>
        <div className="grid grid-cols-[auto_1fr_auto] gap-3 items-center mb-2">
          <div>
            <div className="font-head font-bold text-xl">{bus.departure}</div>
            <div className="text-xs text-gray-500">{bus.boardingPoints?.[0]?.name || from}</div>
          </div>
          <div className="flex flex-col items-center gap-1">
            <span className="chip bg-gray-100 text-gray-600">{minsToHr(bus.durationMins)}</span>
            <div className="w-24 h-0.5 bg-gradient-to-r from-brand-green via-brand-orange to-brand-green relative">
              <span className="absolute -left-1 -top-1 w-2 h-2 rounded-full bg-brand-green"></span>
              <span className="absolute -right-1 -top-1 w-2 h-2 rounded-full bg-brand-green"></span>
            </div>
          </div>
          <div className="text-right">
            <div className="font-head font-bold text-xl">{bus.arrival}</div>
            <div className="text-xs text-gray-500">{bus.droppingPoints?.[0]?.name || to}</div>
          </div>
        </div>
        <div className="flex items-center gap-3 text-xs">
          {bus.rating && <span className="chip bg-emerald-100 text-emerald-700 font-bold">★ {bus.rating}</span>}
          {bus.ratingCount && <span className="text-gray-500">{bus.ratingCount.toLocaleString('en-IN')} ratings</span>}
          <span className={lowSeats ? 'text-red-600 font-semibold' : 'text-emerald-600 font-semibold'}>
            {bus.seatsAvailable} seats left
          </span>
        </div>
      </div>
      <div className="flex md:flex-col justify-between items-end gap-3 md:pl-4 md:border-l border-dashed border-gray-200 md:min-w-[160px]">
        <div className="text-right">
          <div className="text-xs text-gray-400 line-through">₹{bus.strikeFare.toLocaleString('en-IN')}</div>
          <div className="font-head font-extrabold text-2xl text-brand-green-d leading-none">₹{bus.displayedFare.toLocaleString('en-IN')}</div>
          <div className="chip bg-emerald-100 text-emerald-700 mt-1 font-bold">
            SAVE ₹{(bus.strikeFare - bus.displayedFare).toLocaleString('en-IN')}
          </div>
        </div>
        <Link
          href={`/select-seats/${encodeURIComponent(bus.externalId)}?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&date=${date}`}
          className="btn-primary text-sm py-2.5 px-5"
        >
          View Seats
        </Link>
      </div>
    </div>
  );
}

function minsToHr(m) {
  if (!m) return '';
  const h = Math.floor(m / 60), mm = m % 60;
  return `${h}h ${mm}m`;
}
