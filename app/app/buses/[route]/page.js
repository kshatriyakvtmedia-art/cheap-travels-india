import { Suspense } from 'react';
import { parseRouteSlug } from '@/lib/route-slug';
import BusResultsClient from './client';

export function generateMetadata({ params }) {
  const { from, to } = parseRouteSlug(params.route);
  return {
    title: `${from} to ${to} Bus Tickets | Cheap Travels India`,
    description: `Book ${from} to ${to} bus tickets at the lowest price. Direct from operator. Zero convenience fee. WhatsApp ticket in 90 seconds. Save up to 5% vs MakeMyTrip.`,
    openGraph: {
      title: `${from} to ${to} Bus Tickets | Cheap Travels India`,
      description: `Cheapest ${from}–${to} buses. Zero convenience fee. Ticket on WhatsApp in 90 seconds.`,
    },
  };
}

export default function BusResultsPage({ params, searchParams }) {
  const { from, to } = parseRouteSlug(params.route);
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  const date = (searchParams.date && /^\d{4}-\d{2}-\d{2}$/.test(searchParams.date))
    ? searchParams.date
    : today;

  return (
    <Suspense
      fallback={
        <div className="bg-brand-surface min-h-screen">
          <div className="bg-brand-green text-white py-4">
            <div className="max-w-7xl mx-auto px-4 text-sm font-semibold">
              {from} → {to}
            </div>
          </div>
          <div className="max-w-7xl mx-auto px-4 mt-5 space-y-3">
            {[1, 2, 3].map(i => <div key={i} className="card p-6 animate-pulse h-32" />)}
          </div>
        </div>
      }
    >
      <BusResultsClient route={params.route} date={date} />
    </Suspense>
  );
}
