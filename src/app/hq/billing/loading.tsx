export default function HQBillingLoading() {
  return (
    <div className="flex min-h-screen bg-surface-container-lowest animate-pulse">
      <aside className="fixed left-0 top-0 h-full w-64 border-r border-outline-variant bg-surface flex flex-col py-6 gap-3 px-4">
        <div className="h-6 w-24 bg-surface-container rounded mb-4" />
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-9 bg-surface-container/60 rounded" />
        ))}
      </aside>
      <main className="ml-64 flex-1 p-8 pt-12">
        <div className="max-w-7xl">
          <div className="mb-8">
            <div className="h-3 w-28 bg-surface-container rounded mb-2" />
            <div className="h-7 w-56 bg-surface-container rounded" />
          </div>
          <div className="grid grid-cols-4 gap-6 mb-8">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-28 bg-surface-container rounded" />
            ))}
          </div>
          <div className="h-48 bg-surface-container rounded mb-6" />
          <div className="h-64 bg-surface-container/60 rounded" />
        </div>
      </main>
    </div>
  );
}
