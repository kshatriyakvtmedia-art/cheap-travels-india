import { Suspense } from 'react';
import { parseRouteSlug } from '@/lib/route-slug';
import SelectSeatsClient from './client';

export function generateMetadata({ params }) {
  const { from, to } = parseRouteSlug(params.route);
  return {
    title: `Select Seat — ${from} to ${to} | Cheap Travels India`,
    description: `Choose your seat for ${from} to ${to}. Direct from operator. Zero convenience fee.`,
  };
}

export default function SelectSeatsPage({ params, searchParams }) {
  const busId = searchParams.busId ? decodeURIComponent(searchParams.busId) : null;
  const today = new Date().toISOString().slice(0, 10);
  const date = (searchParams.date && /^\d{4}-\d{2}-\d{2}$/.test(searchParams.date))
    ? searchParams.date
    : today;

  return (
    <Suspense
      fallback={
        <div className="max-w-7xl mx-auto p-8 flex flex-col items-center gap-3 text-gray-500">
          <div className="w-10 h-10 rounded-full border-4 border-brand-green border-t-transparent animate-spin" />
          Loading seat map…
        </div>
      }
    >
      <SelectSeatsClient route={params.route} busId={busId} date={date} />
    </Suspense>
  );
}
