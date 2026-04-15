'use client'

import {
  CheckIcon,
  Copy,
  ExternalLink,
  Image as ImageIcon,
  LinkIcon,
  MessageCircleIcon,
  MoreHorizontal,
  Share2,
  Square,
  SquareCheck,
  Settings2,
  Archive,
  Trash2,
} from 'lucide-react'
import React from 'react'
import NextImage from 'next/image'
import ShareLinkManager from '@/components/share-link-manager'

// ── Blur-up lazy image ──────────────────────────────────────────────────────
function BlurImage({
  src,
  alt,
  placeholderClass,
  eager = false,
}: {
  src: string
  alt: string
  placeholderClass: string
  eager?: boolean
}) {
  const [loaded, setLoaded] = React.useState(false)

  return (
    <div className="relative w-full h-full">
      {/* Shimmer placeholder — hidden once image is loaded */}
      <div
        className={`absolute inset-0 rounded-xl overflow-hidden transition-opacity duration-300 ${
          loaded ? 'opacity-0 pointer-events-none' : 'opacity-100'
        } ${placeholderClass}`}
        aria-hidden
      >
        {/* Moving shimmer streak */}
        <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-white/30 to-transparent" />
      </div>

      {/* Real image — fades + unblurs in */}
      <NextImage
        src={src}
        alt={alt}
        fill
        sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, (max-width: 1280px) 33vw, 25vw"
        loading={eager ? 'eager' : 'lazy'}
        onLoad={() => setLoaded(true)}
        className={`object-cover rounded-xl transition-all duration-500 ease-out ${
          loaded ? 'opacity-100 blur-0 scale-100' : 'opacity-0 blur-md scale-[1.04]'
        }`}
      />
    </div>
  )
}

export type Project = {
  id: string
  title: string
  updatedAt: string
  isNew: boolean
  color: string
  image?: string
  thumbnails?: string[]
  stats: {
    likes: number
    comments: number
    shares: number
    images: number
  }
}

type ProjectCardProps = {
  project: Project
  onOpen: (project: Project) => void
  onDuplicate: (project: Project) => void
  onDelete: (projectId: string) => void
  isAdmin?: boolean
  isSelected?: boolean
  onSelect?: (projectId: string) => void
  index?: number
}

const Tip: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="relative group/tip">
    {children}
    <div className="pointer-events-none absolute top-full left-1/2 -translate-x-1/2 mt-2 z-10 whitespace-nowrap rounded-md bg-white px-2 py-1 text-xs font-medium text-gray-800 shadow-md opacity-0 scale-95 group-hover/tip:opacity-100 group-hover/tip:scale-100 transition-all duration-150">
      {label}
    </div>
  </div>
)

export default function ProjectCard({ project, onOpen, onDuplicate, onDelete, isAdmin = false, isSelected = false, onSelect, index = 0 }: ProjectCardProps) {
  const [isHovered, setIsHovered] = React.useState(false)
  const [activeIndex, setActiveIndex] = React.useState(0)
  const [menuOpen, setMenuOpen] = React.useState(false)
  const menuRef = React.useRef<HTMLDivElement>(null)

  const MENU_ITEMS = [
    { label: 'Project settings', icon: Settings2, destructive: false, action: () => {} },
    { label: 'Archive canvas',   icon: Archive,   destructive: false, action: () => {} },
    { label: 'Delete Project',   icon: Trash2,    destructive: true,  action: () => onDelete(project.id) },
  ]

  // Build image list: primary image + any thumbnails
  const allImages = [
    ...(project.image && project.image !== '/placeholder.svg' ? [project.image] : []),
    ...(project.thumbnails ?? []),
  ]

  React.useEffect(() => {
    if (!menuOpen) return
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [menuOpen])

  // Cap delay at 10 cards so late items don't feel sluggish
  const delayMs = Math.min(index, 10) * 50

  return (
    <div
      style={{ animationDelay: `${delayMs}ms` }}
      className={`animate-card-enter bg-muted p-2 rounded-xl transition-shadow duration-300 cursor-pointer hover:shadow-lg ${isSelected ? 'ring-2 ring-primary' : ''}`}
      onClick={() => onOpen(project)}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => { setIsHovered(false); setMenuOpen(false) }}
    >
      {/* ── Thumbnail area — fixed height ── */}
      <div className="relative h-[200px] rounded-2xl">

        {/* Hover overlay */}
        {isHovered && (
          <div className="absolute inset-0 z-10 backdrop-blur-sm bg-black/50 flex flex-col rounded-xl">

            {/* Top bar */}
            <div className="flex items-center justify-between px-2 pt-2">
              {isAdmin ? (
                <Tip label="Select">
                  <button
                    onClick={(e) => { e.stopPropagation(); onSelect?.(project.id) }}
                    className="p-1.5 rounded-md text-white transition-colors"
                  >
                    {isSelected ? <SquareCheck size={16} /> : <Square size={16} />}
                  </button>
                </Tip>
              ) : <div />}

              {isAdmin && (
                <div className="flex items-center gap-2">
                  <Tip label="Share">
                    <ShareLinkManager
                      resourceType="project"
                      resourceId={project.id}
                      createdBy="user"
                      resourceName={project.title}
                      trigger={
                        <button
                          onClick={(e) => e.stopPropagation()}
                          className="p-1.5 rounded-md bg-white/20 hover:bg-white/30 text-white transition-colors"
                        >
                          <Share2 size={15} />
                        </button>
                      }
                    />
                  </Tip>

                  <div className="relative" ref={menuRef}>
                    <Tip label="More actions">
                      <button
                        onClick={(e) => { e.stopPropagation(); setMenuOpen((o) => !o) }}
                        className="p-1.5 rounded-md bg-white/20 hover:bg-white/30 text-white transition-colors"
                      >
                        <MoreHorizontal size={15} />
                      </button>
                    </Tip>

                    {menuOpen && (
                      <div
                        className="absolute right-0 top-full mt-1.5 z-50 w-48 rounded-xl bg-popover border border-border shadow-xl overflow-hidden"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="py-1">
                          {MENU_ITEMS.map(({ label, icon: Icon, destructive, action }) => (
                            <button
                              key={label}
                              onClick={(e) => { e.stopPropagation(); action(); setMenuOpen(false) }}
                              className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm transition-colors hover:rounded-md hover:bg-accent/10 ${
                                destructive
                                  ? 'text-destructive hover:text-destructive'
                                  : 'text-popover-foreground hover:text-accent'
                              }`}
                            >
                              <Icon size={14} className="shrink-0" />
                              {label}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Center actions */}
            <div className="flex-1 flex items-center justify-center gap-3">
              <button
                onClick={(e) => { e.stopPropagation(); onOpen(project) }}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white/20 hover:bg-white/30 text-white text-sm font-medium transition-colors"
              >
                <ExternalLink size={14} />
                Open
              </button>
              {isAdmin && (
                <button
                  onClick={(e) => { e.stopPropagation(); onDuplicate(project) }}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white/20 hover:bg-white/30 text-white text-sm font-medium transition-colors"
                >
                  <Copy size={14} />
                  Duplicate
                </button>
              )}
            </div>

            <div className="pb-2" />
          </div>
        )}

        {/* Image / Carousel */}
        {allImages.length > 0 ? (
          <>
            {/* All images stacked, only active one visible */}
            {allImages.map((src, i) => (
              <div
                key={i}
                className={`absolute inset-0 transition-opacity duration-300 ${
                  i === activeIndex ? 'opacity-100' : 'opacity-0 pointer-events-none'
                }`}
              >
                <BlurImage
                  src={src}
                  alt={`${project.title} — slide ${i + 1}`}
                  placeholderClass={project.color}
                  eager={i === 0 && index < 4}
                />
              </div>
            ))}

            {/* Carousel dots */}
            {allImages.length > 1 && (
              <div className="absolute bottom-2 left-1/2 -translate-x-1/2 z-20 flex gap-1">
                {allImages.map((_, i) => (
                  <button
                    key={i}
                    onClick={(e) => { e.stopPropagation(); setActiveIndex(i) }}
                    className={`w-1.5 h-1.5 rounded-full transition-colors ${
                      i === activeIndex ? 'bg-white' : 'bg-accent'
                    }`}
                  />
                ))}
              </div>
            )}
          </>
        ) : (
          /* Placeholder — colored card preview */
          <div className={`absolute inset-0 ${project.color} flex items-center justify-center rounded-xl`}>
            <div className="w-3/4 h-3/4 bg-white/40 rounded-lg shadow-md transform -rotate-3 p-3 space-y-2">
              <div className="h-2 w-3/4 bg-foreground/10 rounded-full" />
              <div className="h-2 w-1/2 bg-foreground/10 rounded-full" />
              <div className="h-8 w-full bg-foreground/5 rounded mt-2" />
            </div>
          </div>
        )}
      </div>

      {/* ── Card body ── */}
      <div className="px-3 py-2">
        <h3 className="text-lg font-bold mb-2 truncate">{project.title}</h3>
        <p className="text-sm text-muted-foreground mb-4">Updated {project.updatedAt}</p>

        <div className="w-full flex items-center gap-3">
          <div className="flex items-center gap-1 bg-primary/10 rounded-md px-2 py-0.5 text-primary/80 text-xs">
            <CheckIcon size={10} /><span>{project.stats.likes}</span>
          </div>
          <div className="flex items-center gap-1 bg-primary/10 rounded-md px-2 py-0.5 text-primary/80 text-xs">
            <MessageCircleIcon size={10} /><span>{project.stats.comments}</span>
          </div>
          <div className="flex items-center gap-1 bg-primary/10 rounded-md px-2 py-0.5 text-primary/80 text-xs">
            <LinkIcon size={10} /><span>{project.stats.shares}</span>
          </div>
          <div className="flex items-center gap-1 bg-primary/10 rounded-md px-2 py-0.5 text-primary/80 text-xs">
            <ImageIcon size={10} /><span>{project.stats.images}</span>
          </div>
        </div>
      </div>
    </div>
  )
}