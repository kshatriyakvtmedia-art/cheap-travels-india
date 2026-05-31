'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';

export default function Waiting() {
  const { orderId } = useParams();
  const router = useRouter();
  const [status, setStatus] = useState('paid_pending');
  const [pnr, setPnr] = useState(null);

  useEffect(() => {
    const id = setInterval(async () => {
      const o = await fetch(`/api/orders/${orderId}`).then(r => r.json());
      setStatus(o.status);
      if (o.status === 'confirmed' && o.provider_pnr) {
        setPnr(o.provider_pnr);
        clearInterval(id);
        setTimeout(() => router.push(`/ticket/${o.provider_pnr}`), 1200);
      }
      if (o.status === 'failed') clearInterval(id);
    }, 4000);
    return () => clearInterval(id);
  }, [orderId, router]);

  return (
    <div className="bg-brand-surface min-h-screen flex items-center justify-center px-4">
      <div className="card max-w-md w-full p-8 text-center">
        {status === 'failed' ? (
          <>
            <div className="w-16 h-16 rounded-full bg-red-100 text-red-600 text-3xl flex items-center justify-center mx-auto mb-4">!</div>
            <h2 className="font-head font-bold text-lg text-red-700 mb-2">Booking could not be confirmed</h2>
            <p className="text-sm text-gray-600">Your payment will be auto-refunded within 24 hours. Order ID: <b>{orderId}</b></p>
          </>
        ) : status === 'confirmed' ? (
          <>
            <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 text-3xl flex items-center justify-center mx-auto mb-4">✓</div>
            <h2 className="font-head font-bold text-lg text-emerald-700">Ticket issued · PNR {pnr}</h2>
            <p className="text-sm text-gray-500 mt-2">Redirecting to your ticket...</p>
          </>
        ) : (
          <>
            <div className="w-16 h-16 rounded-full border-4 border-brand-green border-t-transparent animate-spin mx-auto mb-4" />
            <h2 className="font-head font-bold text-lg text-brand-green-d">Verifying payment & issuing ticket</h2>
            <p className="text-sm text-gray-500 mt-2">This usually takes under 90 seconds. Don't close this window — you'll be redirected automatically.</p>
            <p className="text-xs text-gray-400 mt-4">Order ID: <b>{orderId}</b></p>
          </>
        )}
      </div>
    </div>
  );
}
