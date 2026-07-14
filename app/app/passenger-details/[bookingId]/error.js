'use client';
import Link from 'next/link';
export default function Error({ error, reset }) {
  return (
    <div className="bg-brand-surface min-h-screen flex items-center justify-center px-4">
      <div className="card max-w-md w-full p-8 text-center">
        <div className="text-4xl mb-3">👤</div>
        <h2 className="font-head font-bold text-lg text-brand-ink mb-2">Couldn't load booking</h2>
        <p className="text-sm text-gray-500 mb-4">{error?.message || 'An unexpected error occurred.'}</p>
        <div className="flex gap-3 justify-center">
          <button onClick={reset} className="btn-primary px-5">Try again</button>
          <Link href="/" className="btn-secondary px-5">New search</Link>
        </div>
      </div>
    </div>
  );
}
