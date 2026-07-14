export default function Loading() {
  return (
    <div className="bg-brand-surface min-h-screen pb-12">
      <div className="bg-brand-green h-14" />
      <div className="max-w-7xl mx-auto px-4 mt-5">
        <div className="card p-5 animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-48 mb-5" />
          <div className="grid md:grid-cols-2 gap-6">
            <div className="bg-gray-100 rounded-xl h-64" />
            <div className="space-y-3">
              <div className="h-4 bg-gray-200 rounded w-32" />
              <div className="h-10 bg-gray-100 rounded" />
              <div className="h-10 bg-gray-100 rounded" />
              <div className="h-24 bg-gray-100 rounded" />
              <div className="h-12 bg-gray-200 rounded" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
