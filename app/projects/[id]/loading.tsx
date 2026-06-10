// Workspace-shaped skeleton shown while the project data is fetched on the
// server: top nav, comments sidebar (left), canvas, thumbnails rail (right).
export default function ProjectLoading() {
  return (
    <div className="h-screen bg-background text-foreground flex flex-col">
      {/* Top nav */}
      <div className="h-14 flex items-center justify-between px-4 border-b border-border/50 shrink-0">
        <div className="flex items-center gap-3 animate-pulse">
          <div className="h-8 w-8 rounded-md bg-muted" />
          <div className="h-5 w-44 rounded bg-muted" />
        </div>
        <div className="flex items-center gap-2 animate-pulse">
          <div className="h-8 w-8 rounded-full bg-muted" />
          <div className="h-8 w-24 rounded-md bg-muted" />
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Comments sidebar */}
        <div className="w-72 border-r border-border/50 bg-background p-4 space-y-4 animate-pulse">
          <div className="h-8 w-full rounded-md bg-muted" />
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <div className="flex items-center gap-2">
                <div className="h-7 w-7 rounded-full bg-muted" />
                <div className="h-4 w-24 rounded bg-muted" />
              </div>
              <div className="h-3 w-full rounded bg-muted" />
              <div className="h-3 w-2/3 rounded bg-muted" />
            </div>
          ))}
        </div>

        {/* Canvas */}
        <div className="flex-1 flex flex-col">
          <div className="h-[45px] border-b border-border/50 flex items-center justify-between px-4 animate-pulse">
            <div className="h-4 w-32 rounded bg-muted" />
            <div className="h-4 w-24 rounded bg-muted" />
            <div className="h-4 w-28 rounded bg-muted" />
          </div>
          <div className="flex-1 bg-gray-200 flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        </div>

        {/* Thumbnails rail */}
        <div className="w-32 border-l border-border bg-white p-3 space-y-3 animate-pulse">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-20 w-full rounded-md bg-muted" />
          ))}
        </div>
      </div>
    </div>
  );
}
