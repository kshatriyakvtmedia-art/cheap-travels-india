'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

const POPULAR = [
  { from: 'Azamgarh', to: 'Delhi' },
  { from: 'Delhi', to: 'Azamgarh' },
  { from: 'Lucknow', to: 'Delhi' },
  { from: 'Varanasi', to: 'Delhi' },
  { from: 'Gorakhpur', to: 'Mumbai' },
  { from: 'Patna', to: 'Delhi' },
];

export default function Home() {
  const router = useRouter();
  const todayISO = new Date().toISOString().slice(0, 10);
  const [from, setFrom] = useState('Azamgarh');
  const [to, setTo] = useState('Delhi');
  const [date, setDate] = useState(todayISO);

  const search = (e) => {
    e?.preventDefault();
    const q = new URLSearchParams({ from, to, date }).toString();
    router.push(`/search?${q}`);
  };

  const swap = () => { setFrom(to); setTo(from); };

  return (
    <>
      <section className="relative overflow-hidden text-white" style={{
        background: 'linear-gradient(135deg, #094B30 0%, #0E7B4F 60%, #14B58C 100%)'
      }}>
        <div className="max-w-7xl mx-auto px-4 pt-10 pb-32 relative">
          <h1 className="font-head font-extrabold text-3xl md:text-5xl leading-tight max-w-3xl">
            Affordable bus tickets, <span style={{ color: '#FBE2C3' }}>delivered with trust.</span>
          </h1>
          <p className="mt-3 text-emerald-50 text-sm md:text-base max-w-2xl">
            Verified agent inventory · live rate-compare · WhatsApp ticket in 90 seconds.
          </p>
          <div className="mt-6 flex flex-wrap gap-2 text-xs">
            {['🛡️ Direct from operator','💰 Up to 5% extra discount','📲 WhatsApp ticket push','↩️ Auto-refund if not issued in 30 min'].map(t => (
              <span key={t} className="bg-white/10 border border-white/15 rounded-full px-3 py-1.5">{t}</span>
            ))}
          </div>

          <form onSubmit={search} className="mt-6 bg-white rounded-2xl shadow-lg2 p-4 md:p-5 grid grid-cols-1 md:grid-cols-[1.3fr_auto_1.3fr_1fr_auto] gap-3 items-end border-t-4 border-brand-orange">
            <div>
              <div className="label">FROM</div>
              <input className="input mt-1 text-lg font-semibold text-brand-ink font-head" value={from} onChange={e => setFrom(e.target.value)} />
            </div>
            <button type="button" onClick={swap} className="hidden md:flex w-10 h-10 rounded-full bg-brand-orange-s text-brand-green-d border-2 border-brand-orange items-center justify-center self-center mt-5">⇌</button>
            <div>
              <div className="label">TO</div>
              <input className="input mt-1 text-lg font-semibold text-brand-ink font-head" value={to} onChange={e => setTo(e.target.value)} />
            </div>
            <div>
              <div className="label">DATE</div>
              <input type="date" className="input mt-1 text-lg font-semibold text-brand-ink font-head" value={date} onChange={e => setDate(e.target.value)} />
            </div>
            <button type="submit" className="btn-primary md:px-7 md:py-4">Search Buses →</button>
          </form>

          <div className="mt-5 flex flex-wrap gap-2 items-center text-xs">
            <span className="text-emerald-100/80">Popular routes:</span>
            {POPULAR.map(p => (
              <button key={p.from+p.to} onClick={() => { setFrom(p.from); setTo(p.to); }}
                className="bg-white/10 hover:bg-white/20 border border-white/15 rounded-full px-3 py-1">
                {p.from} → {p.to}
              </button>
            ))}
          </div>
        </div>
      </section>

      <div className="max-w-7xl mx-auto px-4 -mt-20 relative z-10 grid md:grid-cols-4 gap-3">
        {[
          ['🛡️', 'Verified agent network', 'Direct inventory from operator portals'],
          ['💸', '5% extra discount', 'Cheaper than RedBus on same bus'],
          ['📲', 'WhatsApp ticket', 'Branded e-ticket in < 90 sec'],
          ['📞', '24×7 Indian support', 'Hindi & English helpline'],
        ].map(([ico, t, s]) => (
          <div key={t} className="card p-4 flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-brand-orange-s border border-brand-orange flex items-center justify-center text-xl">{ico}</div>
            <div>
              <div className="font-semibold text-sm">{t}</div>
              <div className="text-xs text-brand-ink-2">{s}</div>
            </div>
          </div>
        ))}
      </div>

      <section className="max-w-7xl mx-auto px-4 py-14 grid md:grid-cols-3 gap-5">
        {[
          ['Why Cheap Travels?', 'You pay less than RedBus on the same operator bus. We pass our agent commission back to you as a 5% discount.'],
          ['How is it cheaper?', 'Bus operators give us 20% commission. We keep 15% and pass 5% to you as a discount — that\'s why our fare is lower than RedBus on the same bus.'],
          ['Is my ticket real?', 'Yes. Your PNR comes from the bus operator\'s own system. You can verify it on the operator\'s website. We are a registered agent partner.'],
        ].map(([h, b]) => (
          <div key={h} className="card p-5">
            <h3 className="font-head font-bold text-lg text-brand-green-d mb-2">{h}</h3>
            <p className="text-sm text-brand-ink-2 leading-relaxed">{b}</p>
          </div>
        ))}
      </section>
    </>
  );
}
