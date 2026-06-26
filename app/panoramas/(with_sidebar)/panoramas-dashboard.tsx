'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import CreatePanoramaModal from '@/components/panorama/create-panorama-modal'
import ProjectCard, { type Project } from '@/components/project-card'
import ProjectGridSkeleton from '@/components/project-grid-skeleton'
import {
  getPanoramaProjectsPage,
  deletePanoramaProject,
  renamePanoramaProject,
  type PanoramaProjectListItem,
  type PanoramaSort,
} from '@/app/actions/panorama-projects'
import { formatDistanceToNow } from 'date-fns'
import { getOptimizedImageUrl, IMAGE_SIZES } from '@/lib/image-url'
import { getMediaKind } from '@/lib/media-type'
import { Filter, ArrowUpDown, Search, Upload, Globe, FolderPlus, Trash2, X, CheckSquare, AlertTriangle, Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { IconTooltip } from '@/components/ui/icon-tooltip'

const cardColors = [
  'bg-orange-50', 'bg-green-50', 'bg-blue-50', 'bg-purple-50',
  'bg-rose-50', 'bg-amber-50', 'bg-teal-50', 'bg-sky-50',
]

function mapRow(p: PanoramaProjectListItem, globalIndex: number): Project {
  const previewSource = p.first_image || p.preview_url || ''
  const imagePreview = previewSource && getMediaKind(previewSource) === 'image' ? previewSource : '/placeholder.svg'
  return {
    id: p.id,
    title: p.project_name,
    image: getOptimizedImageUrl(imagePreview, IMAGE_SIZES.DASHBOARD_THUMB),
    updatedAt: p.updated_at
      ? formatDistanceToNow(new Date(p.updated_at)) + ' ago'
      : 'Just now',
    updatedAtTs: p.updated_at ? new Date(p.updated_at).getTime() : Date.now(),
    isNew: false,
    color: cardColors[globalIndex % cardColors.length],
    stats: {
      likes: p.total_resolved_comments || 0,
      comments: p.total_comments || 0,
      shares: p.total_commented_images || 0,
      images: p.total_images || 0,
    },
  }
}

type PanoramasDashboardProps = {
  initialProjects: PanoramaProjectListItem[]
  initialTotal: number
  isAdmin: boolean
}

export default function PanoramasDashboard({ initialProjects, initialTotal, isAdmin }: PanoramasDashboardProps) {
  const router = useRouter()
  const [projects, setProjects] = useState<Project[]>(() => initialProjects.map(mapRow))
  const [total, setTotal] = useState(initialTotal)
  const [page, setPage] = useState(1)
  const [isLoading, setIsLoading] = useState(false)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [sortOrder, setSortOrder] = useState<PanoramaSort>('newest')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [isBulkDeleting, setIsBulkDeleting] = useState(false)
  const [deleteModal, setDeleteModal] = useState<{ type: 'single'; projectId: string; projectName: string } | { type: 'bulk'; ids: string[] } | null>(null)
  const [renameTarget, setRenameTarget] = useState<{ id: string; title: string } | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [isRenaming, setIsRenaming] = useState(false)
  const [renameError, setRenameError] = useState<string | null>(null)

  const hasMore = projects.length < total
  const requestSeq = useRef(0)

  const SORT_LABELS: Record<PanoramaSort, string> = {
    newest: 'Newest first',
    oldest: 'Oldest first',
    name: 'Name (A–Z)',
  }
  const nextSortOrder: PanoramaSort = sortOrder === 'newest' ? 'oldest' : sortOrder === 'oldest' ? 'name' : 'newest'

  const refetchFirstPage = useCallback(async (search: string, sort: PanoramaSort) => {
    const seq = ++requestSeq.current
    setIsLoading(true)
    try {
      const { projects: rows, total: newTotal } = await getPanoramaProjectsPage({ page: 1, search, sort })
      if (seq !== requestSeq.current) return
      setProjects(rows.map(mapRow))
      setTotal(newTotal)
      setPage(1)
    } catch (error) {
      console.error('Failed to fetch panorama projects', error)
    } finally {
      if (seq === requestSeq.current) setIsLoading(false)
    }
  }, [])

  const refresh = useCallback(() => {
    refetchFirstPage(searchQuery, sortOrder)
  }, [refetchFirstPage, searchQuery, sortOrder])

  const loadMore = useCallback(async () => {
    if (isLoading || isLoadingMore || !hasMore) return
    const seq = requestSeq.current
    setIsLoadingMore(true)
    try {
      const nextPage = page + 1
      const { projects: rows, total: newTotal } = await getPanoramaProjectsPage({ page: nextPage, search: searchQuery, sort: sortOrder })
      if (seq !== requestSeq.current) return
      setProjects(prev => {
        const seen = new Set(prev.map(p => p.id))
        const fresh = rows.filter(r => !seen.has(r.id))
        return [...prev, ...fresh.map((r, i) => mapRow(r, prev.length + i))]
      })
      setTotal(newTotal)
      setPage(nextPage)
    } catch (error) {
      console.error('Failed to load more panorama projects', error)
    } finally {
      setIsLoadingMore(false)
    }
  }, [isLoading, isLoadingMore, hasMore, page, searchQuery, sortOrder])

  const isFirstRender = useRef(true)
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false
      return
    }
    const timer = setTimeout(() => refetchFirstPage(searchQuery, sortOrder), 300)
    return () => clearTimeout(timer)
  }, [searchQuery, sortOrder, refetchFirstPage])

  const sentinelRef = useRef<HTMLDivElement | null>(null)
  const loadMoreRef = useRef(loadMore)
  loadMoreRef.current = loadMore
  useEffect(() => {
    const sentinel = sentinelRef.current
    if (!sentinel) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) loadMoreRef.current()
      },
      { rootMargin: '600px' }
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [])

  const handleOpen = (project: Project) => {
    router.push(`/panoramas/${project.id}?name=${encodeURIComponent(project.title)}`)
  }

  const handleDelete = (projectId: string) => {
    const project = projects.find(p => p.id === projectId)
    setDeleteModal({ type: 'single', projectId, projectName: project?.title ?? 'this panorama' })
  }

  const handleToggleSelect = (projectId: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(projectId)) next.delete(projectId)
      else next.add(projectId)
      return next
    })
  }

  const handleSelectAll = () => {
    if (selectedIds.size === projects.length) setSelectedIds(new Set())
    else setSelectedIds(new Set(projects.map(p => p.id)))
  }

  const handleBulkDelete = () => setDeleteModal({ type: 'bulk', ids: Array.from(selectedIds) })

  const handleRenameRequest = (project: Project) => {
    setRenameTarget({ id: project.id, title: project.title })
    setRenameValue(project.title)
    setRenameError(null)
  }

  const handleConfirmRename = async () => {
    if (!renameTarget) return
    const trimmed = renameValue.trim()
    if (!trimmed) { setRenameError('Name cannot be empty'); return }
    if (trimmed === renameTarget.title) { setRenameTarget(null); return }
    setIsRenaming(true)
    setRenameError(null)
    const result = await renamePanoramaProject(renameTarget.id, trimmed)
    setIsRenaming(false)
    if (!result.success) {
      setRenameError(result.error ?? 'Failed to rename panorama')
      return
    }
    setProjects(prev => prev.map(p => p.id === renameTarget.id ? { ...p, title: trimmed } : p))
    setRenameTarget(null)
  }

  const handleConfirmDelete = async () => {
    if (!deleteModal) return
    setIsBulkDeleting(true)
    if (deleteModal.type === 'single') {
      const result = await deletePanoramaProject(deleteModal.projectId)
      setIsBulkDeleting(false)
      setDeleteModal(null)
      if (result.success) refresh()
    } else {
      const results = await Promise.all(deleteModal.ids.map(id => deletePanoramaProject(id)))
      const failed = results.filter(r => !r.success).length
      setSelectedIds(new Set())
      setIsBulkDeleting(false)
      setDeleteModal(null)
      if (failed > 0) console.error(`${failed} panorama(s) failed to delete.`)
      refresh()
    }
  }

  return (
    <>
      <div className="p-6 md:p-8 space-y-6">

        <div className="flex items-center gap-2 max-w-2xl mx-auto">
          <div className="flex-1 relative">
            <Input
              placeholder="search panorama by name"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-10 rounded-full pl-5 pr-16 bg-card border-border text-sm"
            />
            <Button
              size="sm"
              className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-full bg-accent text-accent-foreground hover:bg-accent/90 h-8 px-2 text-xs font-semibold"
            >
              <Search className="h-3 w-3 mr-1" />
            </Button>
          </div>
          {isAdmin && (
            <>
              <span className="text-sm text-muted-foreground">Or</span>
              <CreatePanoramaModal
                onProjectCreated={refresh}
                trigger={
                  <Button size="sm" className="rounded-full bg-primary text-primary-foreground hover:bg-primary/90 gap-1.5 h-8 px-4 text-xs font-semibold">
                    <Upload className="h-3.5 w-3.5" />
                    Upload
                  </Button>
                }
              />
            </>
          )}
        </div>

        {selectedIds.size > 0 && (
          <div className="flex items-center justify-between rounded-xl bg-card border border-border px-4 py-2.5 shadow-sm">
            <div className="flex items-center gap-3">
              <button
                onClick={handleSelectAll}
                className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <CheckSquare size={15} />
                {selectedIds.size === projects.length ? 'Deselect all' : 'Select all'}
              </button>
              <span className="text-sm font-medium text-foreground">{selectedIds.size} selected</span>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="destructive"
                size="sm"
                className="gap-1.5 h-8 px-3 text-xs"
                onClick={handleBulkDelete}
                disabled={isBulkDeleting}
              >
                <Trash2 size={13} />
                {isBulkDeleting ? 'Deleting…' : `Delete ${selectedIds.size}`}
              </Button>
              <IconTooltip label="Clear selection">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-foreground"
                  onClick={() => setSelectedIds(new Set())}
                  aria-label="Clear selection"
                >
                  <X size={14} />
                </Button>
              </IconTooltip>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between">
          <h1 className="text-lg font-semibold text-foreground font-display">Panoramas</h1>
          <div className="flex items-center gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-accent bg-accent/10 hover:text-foreground"
                  onClick={() => setSearchQuery('')}
                >
                  <Filter className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Clear search filter</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-accent bg-accent/10 hover:text-foreground"
                  onClick={() => setSortOrder(nextSortOrder)}
                >
                  <ArrowUpDown className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Sorted: {SORT_LABELS[sortOrder]} — click for {SORT_LABELS[nextSortOrder]}</TooltipContent>
            </Tooltip>
            {isAdmin && (
              <Tooltip>
                <CreatePanoramaModal
                  onProjectCreated={refresh}
                  trigger={
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-accent bg-accent/10 hover:text-foreground"
                      >
                        <FolderPlus className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                  }
                />
                <TooltipContent>Create new panorama</TooltipContent>
              </Tooltip>
            )}
          </div>
        </div>

        {isLoading && projects.length === 0 ? (
          <ProjectGridSkeleton count={8} />
        ) : projects.length === 0 ? (
          <div className="flex h-64 flex-col items-center justify-center text-muted-foreground">
            <Globe size={48} className="mb-4 opacity-50" />
            <p>
              {searchQuery
                ? `No panoramas match "${searchQuery}"`
                : isAdmin
                ? 'No panoramas yet. Create one to get started!'
                : 'No panoramas have been shared with you yet.'}
            </p>
          </div>
        ) : (
          <>
            <div className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-5 transition-opacity ${isLoading ? 'opacity-50 pointer-events-none' : 'opacity-100'}`}>
              {projects.map((project, i) => (
                <ProjectCard
                  key={project.id}
                  project={project}
                  onOpen={handleOpen}
                  onDuplicate={() => {}}
                  onDelete={handleDelete}
                  onRename={isAdmin ? handleRenameRequest : undefined}
                  isAdmin={isAdmin}
                  isSelected={selectedIds.has(project.id)}
                  onSelect={handleToggleSelect}
                  index={i}
                  basePath="/panoramas"
                  shareResourceType="panorama_project"
                />
              ))}
            </div>
            {isLoadingMore && (
              <div className="mt-5">
                <ProjectGridSkeleton count={4} />
              </div>
            )}
            {hasMore && <div ref={sentinelRef} className="h-1" aria-hidden="true" />}
          </>
        )}
      </div>

      <Dialog
        open={!!renameTarget}
        onOpenChange={(open) => {
          if (!open && !isRenaming) {
            setRenameTarget(null)
            setRenameError(null)
          }
        }}
      >
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <div className="flex items-center gap-3 mb-1">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                <Pencil className="h-5 w-5 text-primary" />
              </div>
              <DialogTitle>Rename panorama</DialogTitle>
            </div>
            <DialogDescription className="pl-[52px]">
              Choose a new name for this panorama project.
            </DialogDescription>
          </DialogHeader>
          <div className="pl-[52px] pr-1">
            <Input
              autoFocus
              value={renameValue}
              onChange={(e) => { setRenameValue(e.target.value); if (renameError) setRenameError(null) }}
              onKeyDown={(e) => { if (e.key === 'Enter' && !isRenaming) handleConfirmRename() }}
              placeholder="Panorama name"
              maxLength={300}
              disabled={isRenaming}
            />
            {renameError && <p className="mt-2 text-xs text-destructive">{renameError}</p>}
          </div>
          <DialogFooter className="mt-2">
            <Button variant="outline" onClick={() => { setRenameTarget(null); setRenameError(null) }} disabled={isRenaming}>
              Cancel
            </Button>
            <Button onClick={handleConfirmRename} disabled={isRenaming || !renameValue.trim()}>
              {isRenaming ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteModal} onOpenChange={(open) => !open && setDeleteModal(null)}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <div className="flex items-center gap-3 mb-1">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10">
                <AlertTriangle className="h-5 w-5 text-destructive" />
              </div>
              <DialogTitle>
                {deleteModal?.type === 'bulk'
                  ? `Delete ${deleteModal.ids.length} panorama${deleteModal.ids.length > 1 ? 's' : ''}?`
                  : 'Delete panorama?'}
              </DialogTitle>
            </div>
            <DialogDescription className="pl-[52px]">
              {deleteModal?.type === 'bulk'
                ? `You're about to permanently delete ${deleteModal.ids.length} panorama${deleteModal.ids.length > 1 ? 's' : ''} and all their images and comments. This cannot be undone.`
                : <>You're about to permanently delete <span className="font-medium text-foreground">"{deleteModal?.type === 'single' ? deleteModal.projectName : ''}"</span> and all its images and comments. This cannot be undone.</>}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-2">
            <Button variant="outline" onClick={() => setDeleteModal(null)} disabled={isBulkDeleting}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleConfirmDelete} disabled={isBulkDeleting}>
              {isBulkDeleting ? 'Deleting…' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
