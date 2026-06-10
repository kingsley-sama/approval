export default function ProjectGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-5">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="bg-muted rounded-xl p-2 animate-pulse">
          <div className="h-[200px] rounded-xl bg-muted-foreground/10 mb-2" />
          <div className="px-3 py-2 space-y-2">
            <div className="h-5 w-3/4 bg-muted-foreground/10 rounded" />
            <div className="h-3 w-1/2 bg-muted-foreground/10 rounded" />
            <div className="flex gap-2 mt-3">
              {Array.from({ length: 4 }).map((_, j) => (
                <div key={j} className="h-5 w-10 bg-muted-foreground/10 rounded" />
              ))}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
