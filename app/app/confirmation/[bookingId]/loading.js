export default function Loading() {
  return (
    <div className="bg-brand-surface min-h-screen flex items-center justify-center">
      <div className="text-center">
        <div className="w-10 h-10 rounded-full border-4 border-brand-green border-t-transparent animate-spin mx-auto mb-3" />
        <p className="text-sm text-gray-500">Loading your booking...</p>
      </div>
    </div>
  );
}
