'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import Sidebar from '@/components/sidebar'
import ProjectGrid from '@/components/project-grid'
import ProjectDuplicator from '@/components/project-duplicator'
import CreateProjectModal from '@/components/create-project-modal'
import { getProjects, deleteProject } from '@/app/actions/projects'
import { Folder, FolderPlus } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'

interface Project {
  id: string
  title: string
  subtitle: string
  image: string
  updatedAt: string
  isNew: boolean
  stats: {
    likes: number
    comments: number
    shares: number
  }
}

export default function Home() {
  const router = useRouter()
  const [duplicatingProject, setDuplicatingProject] = useState<Project | null>(null)
  const [projects, setProjects] = useState<Project[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const fetchProjects = async () => {
    setIsLoading(true)
    try {
      const data = await getProjects()
      const mappedProjects: Project[] = data.map((p: any) => ({
        id: p.id,
        title: p.project_name,
        subtitle: p.updated_at ? `Updated ${formatDistanceToNow(new Date(p.updated_at))} ago` : 'Recently updated',
        image: p.markup_url || '/placeholder.svg',
        updatedAt: p.updated_at ? formatDistanceToNow(new Date(p.updated_at)) + ' ago' : 'Just now',
        isNew: false, // Logic for isNew can be added later
        stats: { 
          likes: 0, 
          comments: p.total_threads || 0, 
          shares: 0 
        }
      }))
      setProjects(mappedProjects)
    } catch (error) {
      console.error('Failed to fetch projects', error)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchProjects()
  }, [])

  const handleDuplicateFolder = (project: Project) => {
    setDuplicatingProject(project)
  }

  const handleOpenFolder = (project: Project) => {
    // Navigate to project page with project ID and name
    const encodedTitle = encodeURIComponent(project.title)
    router.push(`/project/${project.id}?name=${encodedTitle}`)
  }
  const hanldDeleteFolder = async (projectId: string) => {
    if (confirm('Are you sure you want to delete this project?')) {
      const result = await deleteProject(projectId)
      if (result.success) {
        fetchProjects()
      } else {
        alert('Failed to delete project')
      }
    }
  }

  return (
    <div className="flex h-screen bg-background">
      <Sidebar />
      <main className="flex-1 overflow-auto">
        <div className="p-8">
          <div className="mb-8 flex items-center justify-between">
            <div>
              <h1 className="text-4xl font-bold text-foreground mb-2">Projects</h1>
              <p className="text-muted-foreground">Manage and organize your architectural projects</p>
            </div>
            <CreateProjectModal onProjectCreated={fetchProjects} />
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center h-64">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : projects.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
              <Folder size={48} className="mb-4 opacity-50" />
              <p>No projects found. Create one to get started!</p>
            </div>
          ) : (
            <ProjectGrid 
              projects={projects}
              onDuplicate={handleDuplicateFolder}
              onOpen={handleOpenFolder}
              onDelete={hanldDeleteFolder}
            />
          )}
        </div>
      </main>

      {duplicatingProject && (
        <ProjectDuplicator
          projectId={duplicatingProject.id}
          projectName={duplicatingProject.title}
          createdBy="user-id-placeholder"
          isOpen={!!duplicatingProject}
          onOpenChange={(open) => !open && setDuplicatingProject(null)}
          onSuccess={(newId) => {
            console.log('Duplicated project:', newId)
            setDuplicatingProject(null)
            fetchProjects()
          }}
        />
      )}
    </div>
  )
}
 