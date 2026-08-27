export default function InventoryLoading() {
  return (
    <div className="flex min-h-screen bg-surface animate-pulse">
      <aside className="fixed left-0 top-0 h-full w-64 border-r border-outline-variant bg-surface flex flex-col py-6 gap-3 px-4">
        <div className="h-6 w-24 bg-surface-container rounded mb-4" />
        <div className="h-10 bg-surface-container rounded mb-2" />
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-9 bg-surface-container/60 rounded" />
        ))}
      </aside>
      <div className="ml-64 flex-1 flex flex-col">
        <header className="fixed top-0 right-0 h-16 border-b border-outline-variant bg-surface w-[calc(100%-16rem)] z-10 flex items-center justify-between px-8">
          <div>
            <div className="h-3 w-24 bg-surface-container rounded mb-1" />
            <div className="h-5 w-36 bg-surface-container rounded" />
          </div>
          <div className="h-5 w-24 bg-surface-container rounded" />
        </header>
        <div className="pt-20 pb-16 px-8">
          <div className="h-10 bg-surface-container rounded mb-4" />
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-14 bg-surface-container/60 rounded mb-2" />
          ))}
        </div>
      </div>
    </div>
  );
}
