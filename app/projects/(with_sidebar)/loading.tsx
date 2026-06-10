import ProjectGridSkeleton from '@/components/project-grid-skeleton'

export default function Loading() {
  return (
    <div className="p-6 md:p-8 space-y-6">
      <div className="flex items-center gap-2 max-w-2xl mx-auto">
        <div className="h-10 flex-1 rounded-full bg-muted animate-pulse" />
      </div>
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-foreground font-display">Projects</h1>
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-md bg-muted animate-pulse" />
          <div className="h-8 w-8 rounded-md bg-muted animate-pulse" />
        </div>
      </div>
      <ProjectGridSkeleton count={8} />
    </div>
  )
}
