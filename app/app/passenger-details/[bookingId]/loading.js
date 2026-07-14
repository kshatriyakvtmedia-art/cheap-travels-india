export default function Loading() {
  return (
    <div className="bg-brand-surface min-h-screen pb-12">
      <div className="bg-brand-green h-14" />
      <div className="max-w-3xl mx-auto px-4 mt-5 grid md:grid-cols-[1fr_300px] gap-5">
        <div className="card p-5 animate-pulse space-y-3">
          <div className="h-5 bg-gray-200 rounded w-40" />
          <div className="h-10 bg-gray-100 rounded" />
          <div className="grid grid-cols-2 gap-3">
            <div className="h-10 bg-gray-100 rounded" />
            <div className="h-10 bg-gray-100 rounded" />
          </div>
          <div className="h-10 bg-gray-100 rounded" />
          <div className="h-10 bg-gray-100 rounded" />
          <div className="h-12 bg-gray-200 rounded mt-2" />
        </div>
        <div className="space-y-3">
          <div className="card p-5 animate-pulse h-48" />
          <div className="card p-5 animate-pulse h-40" />
        </div>
      </div>
    </div>
  );
}
