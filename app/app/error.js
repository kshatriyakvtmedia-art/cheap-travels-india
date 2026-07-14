'use client';
export default function Error({ error, reset }) {
  return (
    <div className="bg-brand-surface min-h-screen flex items-center justify-center px-4">
      <div className="card max-w-md w-full p-8 text-center">
        <div className="text-4xl mb-3">⚠️</div>
        <h2 className="font-head font-bold text-lg text-brand-ink mb-2">Something went wrong</h2>
        <p className="text-sm text-gray-500 mb-4">{error?.message || 'An unexpected error occurred.'}</p>
        <button onClick={reset} className="btn-primary px-6">Try again</button>
      </div>
    </div>
  );
}
