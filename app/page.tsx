'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import Sidebar from '@/components/sidebar'
import ProjectGrid from '@/components/project-grid'
import ProjectDuplicator from '@/components/project-duplicator'
import { Folder, FolderPlus } from 'lucide-react'

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
  const [projects, setProjects] = useState<Project[]>([
    {
      id: '1',
      title: '14500-36 Revision 1 Innen',
      subtitle: 'Updated an hour ago',
      image: '/interior-design-bedroom.jpg',
      updatedAt: 'an hour ago',
      isNew: false,
      stats: { likes: 0, comments: 0, shares: 4 }
    },
    {
      id: '2',
      title: '18540-02 Revision 1',
      subtitle: 'Updated 3 hours ago',
      image: '/modern-house-exterior.jpg',
      updatedAt: '3 hours ago',
      isNew: true,
      stats: { likes: 0, comments: 0, shares: 2 }
    },
    {
      id: '3',
      title: '18540-02b Revision 0 Internal',
      subtitle: 'Updated 7 hours ago',
      image: '/interior-office-space.jpg',
      updatedAt: '7 hours ago',
      isNew: false,
      stats: { likes: 0, comments: 0, shares: 3 }
    },
    {
      id: '4',
      title: '18230-01a Revision 1 Internal',
      subtitle: 'Updated 7 hours ago',
      image: '/exterior-modern-building.jpg',
      updatedAt: '7 hours ago',
      isNew: true,
      stats: { likes: 0, comments: 0, shares: 5 }
    },
    {
      id: '5',
      title: '18230-01b Revision 1 Internal',
      subtitle: 'Updated 7 hours ago',
      image: '/living-room-interior.jpg',
      updatedAt: '7 hours ago',
      isNew: true,
      stats: { likes: 0, comments: 0, shares: 13 }
    },
    {
      id: '6',
      title: '17880-02b Pre-Renderings WHG1',
      subtitle: 'Updated 13 hours ago',
      image: '/glass-doors-patio.jpg',
      updatedAt: '13 hours ago',
      isNew: true,
      stats: { likes: 0, comments: 3, shares: 10 }
    },
    {
      id: '7',
      title: '17880-02b Pre-Renderings WHG5',
      subtitle: 'Updated 13 hours ago',
      image: '/outdoor-living-space.jpg',
      updatedAt: '13 hours ago',
      isNew: true,
      stats: { likes: 0, comments: 7, shares: 9 }
    },
    {
      id: '8',
      title: '17880-02a Pre-Renderings',
      subtitle: 'Updated 13 hours ago',
      image: '/red-building-design.jpg',
      updatedAt: '13 hours ago',
      isNew: true,
      stats: { likes: 0, comments: 5, shares: 12 }
    },
    {
      id: '9',
      title: '11890-44 Revision 0 Internal',
      subtitle: 'Updated 18 hours ago',
      image: '/house-exterior-modern.jpg',
      updatedAt: '18 hours ago',
      isNew: true,
      stats: { likes: 0, comments: 3, shares: 3 }
    },
    {
      id: '10',
      title: '18540-02 Revision 1',
      subtitle: 'Updated 19 hours ago',
      image: '/building-exterior-view.jpg',
      updatedAt: '19 hours ago',
      isNew: true,
      stats: { likes: 0, comments: 0, shares: 2 }
    },
  ])

  const handleDuplicateFolder = (project: Project) => {
    setDuplicatingProject(project)
  }

  const handleOpenFolder = (project: Project) => {
    // Navigate to project page with project ID and name
    const encodedTitle = encodeURIComponent(project.title)
    router.push(`/project/${project.id}?name=${encodedTitle}`)
  }
  const hanldDeleteFolder = (projectId: string) => {
    setProjects(projects.filter(project => project.id !== projectId))
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
            <button className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-opacity">
              <FolderPlus size={20} />
              New Project
            </button>
          </div>

          <ProjectGrid 
            projects={projects}
            onDuplicate={handleDuplicateFolder}
            onOpen={handleOpenFolder}
            onDelete={hanldDeleteFolder}
          />
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
            // In a real app, we would refresh the project list here
            setDuplicatingProject(null)
          }}
        />
      )}
    </div>
  )
}
 