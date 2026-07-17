export default function Loading() {
  return (
    <div className="bg-brand-surface min-h-screen pb-12">
      <div className="bg-brand-green h-14" />
      <div className="max-w-7xl mx-auto px-4 mt-5 space-y-3">
        <div className="card p-5 animate-pulse h-16 rounded-2xl" />
        <div className="card p-3 animate-pulse h-12 rounded-xl" />
        {[1, 2, 3].map(i => <div key={i} className="card p-6 animate-pulse h-32 rounded-2xl" />)}
      </div>
    </div>
  );
}
