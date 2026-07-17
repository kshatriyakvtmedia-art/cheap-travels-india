import { Suspense } from 'react';
import BookingConfirmationClient from './client';

export function generateMetadata({ params }) {
  const id = params.bookingId;
  return {
    title: `Booking ${id.slice(-6).toUpperCase()} | Cheap Travels India`,
    description: 'Your bus booking is confirmed. E-ticket pushed to WhatsApp and email within 90 seconds.',
    robots: { index: false },
  };
}

export default function BookingPage({ params }) {
  return (
    <Suspense
      fallback={
        <div className="bg-brand-surface min-h-screen flex items-center justify-center">
          <div className="w-10 h-10 rounded-full border-4 border-brand-green border-t-transparent animate-spin" />
        </div>
      }
    >
      <BookingConfirmationClient bookingId={params.bookingId} />
    </Suspense>
  );
}
