'use client'

import { Copy, FolderOpen } from 'lucide-react'
import { useState } from 'react'

interface ProjectStats {
  likes: number
  comments: number
  shares: number
}

interface Project {
  id: string
  title: string
  subtitle: string
  image: string
  updatedAt: string
  isNew: boolean
  stats: ProjectStats
}

interface ProjectGridProps {
  projects: Project[]
  onDuplicate: (project: Project) => void
  onOpen: (project: Project) => void
  onDelete: (projectId: string) => void
}

export default function ProjectGrid({ projects, onDuplicate, onOpen, onDelete }: ProjectGridProps) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 lg:gap-8 gap-4">
      {projects.map((project) => (
        <div
          key={project.id}
          className="bg-card rounded-3xl overflow-hidden shadow-sm hover:shadow-xl transition-all duration-300 flex flex-col"
        >
          {/* Image Container */}
          <div className="relative w-full aspect-[3/3] overflow-hidden bg-muted px-6 py-4 rounded-2xl group flex-shrink-0">
            <img
              src={project.image || "/placeholder.svg"}
              alt={project.title}
              className="w-full h-full object-cover rounded-xl group-hover:scale-105 transition-transform duration-300"
              onError={(e) => {
                e.currentTarget.src = '/placeholder.svg'
              }}
            />

            {/* Action Buttons - visible on hover */}
            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center gap-3 rounded-xl px-6 py-4">
              <button
                onClick={() => onOpen(project)}
                className="flex items-center gap-2 px-4 py-2 bg-white text-black rounded-lg font-medium hover:bg-gray-100 transition-colors text-sm"
                title="Open folder"
              >
                <FolderOpen size={16} />
                Open
              </button>
              <button
                onClick={() => onDuplicate(project)}
                className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg font-medium hover:opacity-90 transition-opacity text-sm"
                title="Duplicate folder"
              >
                <Copy size={16} />
                Duplicate
              </button>
            </div>
          </div>

          {/* Dot Indicators */}
          <div className="flex justify-center gap-2 mt-4">
            <div className="w-2 h-2 rounded-full bg-primary" />
            <div className="w-2 h-2 rounded-full bg-muted" />
            <div className="w-2 h-2 rounded-full bg-muted" />
          </div>

          {/* Project Info */}
          <div className="px-6 py-4 flex-grow flex flex-col justify-between">
            <div>
              <p className="text-xs text-muted-foreground font-medium mb-2">
                {project.subtitle}
              </p>
              <h3 className="font-semibold text-card-foreground text-base mb-2 line-clamp-2">
                {project.title}
              </h3>
            </div>

            {/* Stats */}
            <div className="text-xs text-muted-foreground mt-3 mb-4">
              Updated {project.updatedAt}
            </div>

            <div className="flex items-center gap-4 text-xs text-muted-foreground font-medium">
              <div className="flex items-center gap-1">
                <span>✓</span>
                <span>{project.stats.likes}</span>
              </div>
              <div className="flex items-center gap-1">
                <span>💬</span>
                <span>{project.stats.comments}</span>
              </div>
              <div className="flex items-center gap-1">
                <span>🔗</span>
                <span>{project.stats.shares}</span>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
