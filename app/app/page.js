'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';

const POPULAR_ROUTES = [
  { from: 'Azamgarh', to: 'Delhi' },
  { from: 'Varanasi', to: 'Delhi' },
  { from: 'Lucknow', to: 'Delhi' },
  { from: 'Gorakhpur', to: 'Delhi' },
  { from: 'Allahabad', to: 'Delhi' },
  { from: 'Agra', to: 'Delhi' },
];

export default function HomePage() {
  const router = useRouter();
  const today = new Date().toISOString().slice(0, 10);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [date, setDate] = useState(today);
  const [swapped, setSwapped] = useState(false);

  const swap = () => {
    setFrom(to);
    setTo(from);
    setSwapped(s => !s);
  };

  const search = (e) => {
    e.preventDefault();
    if (!from.trim() || !to.trim()) return;
    router.push(`/results?from=${encodeURIComponent(from.trim())}&to=${encodeURIComponent(to.trim())}&date=${date}`);
  };

  const quickSearch = (f, t) => {
    router.push(`/results?from=${encodeURIComponent(f)}&to=${encodeURIComponent(t)}&date=${date}`);
  };

  return (
    <div className="bg-brand-surface min-h-screen">
      {/* Hero */}
      <div className="text-white py-14 px-4 relative overflow-hidden" style={{ background: 'linear-gradient(135deg,#094B30 0%,#0E7B4F 60%,#16a34a 100%)' }}>
        <div className="max-w-4xl mx-auto relative z-10">
          <div className="flex items-center gap-2 mb-4">
            <span className="bg-brand-orange text-brand-green-d text-xs font-extrabold tracking-wide px-3 py-1 rounded-full">5% MEMBER DISCOUNT</span>
            <span className="text-emerald-200 text-sm">Direct operator rates · No OTA markup</span>
          </div>
          <h1 className="font-head font-extrabold text-3xl md:text-5xl leading-tight mb-3">
            India's Most Affordable<br />Bus Tickets
          </h1>
          <p className="text-emerald-100 text-base md:text-lg mb-8 max-w-xl">
            Direct from operator. Zero convenience fee. Ticket on WhatsApp in 90 seconds.
          </p>

          {/* Search form */}
          <form onSubmit={search} className="bg-white rounded-2xl p-5 shadow-xl">
            <div className="grid md:grid-cols-[1fr_auto_1fr_auto_auto] gap-3 items-end">
              <div>
                <label className="label mb-1">From</label>
                <input
                  className="input text-brand-ink font-semibold"
                  placeholder="e.g. Azamgarh"
                  value={from}
                  onChange={e => setFrom(e.target.value)}
                  required
                />
              </div>

              <button type="button" onClick={swap}
                className="self-end mb-0.5 w-9 h-9 rounded-full bg-brand-surface border border-gray-200 flex items-center justify-center text-brand-green hover:bg-brand-green hover:text-white transition-colors flex-shrink-0">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="w-4 h-4">
                  <path d="M7 16V4m0 0L3 8m4-4l4 4M17 8v12m0 0l4-4m-4 4l-4-4" />
                </svg>
              </button>

              <div>
                <label className="label mb-1">To</label>
                <input
                  className="input text-brand-ink font-semibold"
                  placeholder="e.g. Delhi"
                  value={to}
                  onChange={e => setTo(e.target.value)}
                  required
                />
              </div>

              <div>
                <label className="label mb-1">Date</label>
                <input
                  className="input"
                  type="date"
                  value={date}
                  min={today}
                  onChange={e => setDate(e.target.value)}
                />
              </div>

              <button type="submit" className="btn-primary self-end whitespace-nowrap px-6">
                Search Buses
              </button>
            </div>
          </form>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-10">
        {/* Popular routes */}
        <h2 className="font-head font-bold text-lg text-brand-ink mb-4">Popular Routes</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-10">
          {POPULAR_ROUTES.map(r => (
            <button key={`${r.from}-${r.to}`} onClick={() => quickSearch(r.from, r.to)}
              className="card p-4 text-left hover:border-brand-green hover:shadow-md transition-all group">
              <div className="text-xs text-gray-400 mb-1 group-hover:text-brand-green transition-colors">Bus tickets</div>
              <div className="font-semibold text-sm text-brand-ink">{r.from} → {r.to}</div>
            </button>
          ))}
        </div>

        {/* Why cheap travels */}
        <h2 className="font-head font-bold text-lg text-brand-ink mb-4">Why Cheap Travels India?</h2>
        <div className="grid md:grid-cols-3 gap-4 mb-10">
          <Feature icon="💸" title="Zero convenience fee" desc="No hidden charges. The price you see is what you pay." />
          <Feature icon="📲" title="WhatsApp ticket in 90s" desc="Operator ticket pushed to your WhatsApp the moment payment clears." />
          <Feature icon="🛡️" title="30-min refund SLA" desc="If your ticket isn't issued in 30 minutes, you get a full auto-refund." />
        </div>

        {/* Trust strip */}
        <div className="rounded-2xl p-5 text-white flex flex-wrap items-center justify-between gap-4"
             style={{ background: 'linear-gradient(135deg,#094B30,#0E7B4F)' }}>
          <div>
            <div className="font-head font-bold text-lg">Why book with us?</div>
            <div className="text-emerald-200 text-sm mt-1">Direct from operator · No middleman fee</div>
          </div>
          <div className="flex gap-4 text-sm">
            <div className="bg-white/10 rounded-lg px-3 py-2 text-center">
              <div className="text-xs text-emerald-200">Convenience fee</div>
              <div className="font-bold text-brand-orange">₹0</div>
            </div>
            <div className="bg-white/10 rounded-lg px-3 py-2 text-center">
              <div className="text-xs text-emerald-200">Member discount</div>
              <div className="font-bold text-brand-orange">5% off</div>
            </div>
            <div className="bg-white/10 rounded-lg px-3 py-2 text-center">
              <div className="text-xs text-emerald-200">Ticket delivery</div>
              <div className="font-bold text-brand-orange">WhatsApp</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const Feature = ({ icon, title, desc }) => (
  <div className="card p-5">
    <div className="text-2xl mb-2">{icon}</div>
    <div className="font-bold text-sm text-brand-ink mb-1">{title}</div>
    <div className="text-xs text-gray-500 leading-relaxed">{desc}</div>
  </div>
);

