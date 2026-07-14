export default function Loading() {
  return (
    <div className="bg-brand-surface min-h-screen pb-12">
      <div className="bg-brand-green h-14" />
      <div className="max-w-3xl mx-auto px-4 mt-5 grid md:grid-cols-[1fr_280px] gap-5">
        <div className="space-y-4">
          <div className="card p-4 animate-pulse h-16" />
          <div className="card p-6 animate-pulse h-80 flex items-center justify-center">
            <div className="w-16 h-16 rounded-full border-4 border-brand-green border-t-transparent animate-spin" />
          </div>
        </div>
        <div className="space-y-3">
          <div className="card p-5 animate-pulse h-48" />
          <div className="card p-5 animate-pulse h-40" />
        </div>
      </div>
    </div>
  );
}
