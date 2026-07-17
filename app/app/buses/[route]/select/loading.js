export default function Loading() {
  return (
    <div className="max-w-7xl mx-auto p-8 flex flex-col items-center gap-3 text-gray-500">
      <div className="w-10 h-10 rounded-full border-4 border-brand-green border-t-transparent animate-spin" />
      Loading seat map…
    </div>
  );
}
