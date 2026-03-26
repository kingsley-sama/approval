'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import ProjectDuplicator from '@/components/project-duplicator'
import CreateProjectModal from '@/components/create-project-modal'
import ProjectCard, { type Project } from '@/components/project-card'
import { getProjects, deleteProject } from '@/app/actions/projects'
import { formatDistanceToNow } from 'date-fns'
import { Filter, ArrowUpDown, FolderOpen, Search, Upload, Folder } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

const cardColors = [
  'bg-orange-50', 'bg-green-50', 'bg-blue-50', 'bg-purple-50',
  'bg-rose-50', 'bg-amber-50', 'bg-teal-50', 'bg-sky-50',
]

export default function ProjectsPage() {
  const router = useRouter()
  const [projects, setProjects] = useState<Project[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [duplicatingProject, setDuplicatingProject] = useState<Project | null>(null)

  const fetchProjects = async () => {
    setIsLoading(true)
    try {
      const data = await getProjects()
      const mapped: Project[] = data.map((p: any, i: number) => ({
        id: p.id,
        title: p.project_name,
        image: p.first_image || p.markup_url || '/placeholder.svg',
        updatedAt: p.updated_at
          ? formatDistanceToNow(new Date(p.updated_at)) + ' ago'
          : 'Just now',
        isNew: false,
        color: cardColors[i % cardColors.length],
        stats: {
          likes: p.total_resolved_comments || 0,
          comments: p.total_comments || 0,
          shares: p.total_commented_threads || 0,
          images: p.total_images || 0,
        },
      }))
      setProjects(mapped)
    } catch (error) {
      console.error('Failed to fetch projects', error)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => { fetchProjects() }, [])

  const handleOpen = (project: Project) => {
    router.push(`/projects/${project.id}?name=${encodeURIComponent(project.title)}`)
  }

  const handleDelete = async (projectId: string) => {
    if (confirm('Are you sure you want to delete this project?')) {
      const result = await deleteProject(projectId)
      if (result.success) fetchProjects()
      else alert('Failed to delete project')
    }
  }

  return (
    <>
      <div className="p-6 md:p-8 space-y-6">

        {/* URL input bar */}
        <div className="flex items-center gap-2 max-w-2xl mx-auto">
          <div className="flex-1 relative">
            <Input
              placeholder="search project by name"
              className="h-10 rounded-full pl-5 pr-16 bg-card border-border text-sm"
            />
            <Button
              size="sm"
              className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-full bg-accent text-accent-foreground hover:bg-accent/90 h-8 px-2 text-xs font-semibold"
            >
              <Search className="h-3 w-3 mr-1" />
            </Button>
          </div>
          <span className="text-sm text-muted-foreground">Or</span>
          <Button  variant="outline" className="rounded-full h-10 px-5 gap-2 font-semibold border-foreground/20 hover:bg-accent/10 hover:text-accent transition-colors">
            <Upload className="h-3 w-4" />
            Upload
          </Button>
        </div>

        {/* Workspace header */}
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-semibold text-foreground font-display">Projects</h1>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" className="h-8 w-8 text-accent bg-accent/10 hover:text-foreground">
              <Filter className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8 text-accent bg-accent/10 hover:text-foreground">
              <ArrowUpDown className="h-4 w-4" />
            </Button>
            <CreateProjectModal onProjectCreated={fetchProjects} />
          </div>
        </div>

        {/* Content */}
        {isLoading ? (
          <div className="flex h-64 items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary" />
          </div>
        ) : projects.length === 0 ? (
          <div className="flex h-64 flex-col items-center justify-center text-muted-foreground">
            <Folder size={48} className="mb-4 opacity-50" />
            <p>No projects found. Create one to get started!</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-5">
            {projects.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                onOpen={handleOpen}
                onDuplicate={setDuplicatingProject}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}
      </div>

      {duplicatingProject && (
        <ProjectDuplicator
          projectId={duplicatingProject.id}
          projectName={duplicatingProject.title}
          createdBy="user-id-placeholder"
          isOpen={!!duplicatingProject}
          onOpenChange={(open) => !open && setDuplicatingProject(null)}
          onSuccess={(newId) => {
            setDuplicatingProject(null)
            fetchProjects()
          }}
        />
      )}
    </>
  )
}