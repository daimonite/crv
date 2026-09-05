/**
 * @route /hq/* (loading state)
 * @description Skeleton shown while HQ console server components fetch data.
 */
export default function HQLoading() {
  return (
    <div className="flex min-h-screen bg-surface-container-lowest animate-pulse">
      <aside className="fixed left-0 top-0 h-full w-64 border-r border-outline-variant bg-surface flex flex-col py-6 gap-3 px-4">
        <div className="h-6 w-24 bg-surface-container rounded mb-4" />
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-9 bg-surface-container/60 rounded" />
        ))}
      </aside>
      <main className="ml-64 flex-1 p-8 pt-12">
        <div className="max-w-6xl">
          <div className="h-8 w-48 bg-surface-container rounded mb-8" />
          <div className="grid grid-cols-3 gap-6 mb-8">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-40 bg-surface-container rounded" />
            ))}
          </div>
          <div className="h-24 bg-surface-container rounded" />
        </div>
      </main>
    </div>
  );
}
