import { getProjectsPage } from '@/app/actions/projects'
import { getUser } from '@/lib/db/queries'
import ProjectsDashboard from './projects-dashboard'

export default async function ProjectsPage() {
  const user = await getUser()
  const { projects, total } = await getProjectsPage({ page: 1 })

  return (
    <ProjectsDashboard
      initialProjects={projects}
      initialTotal={total}
      isAdmin={user?.role === 'admin'}
      currentUserId={user?.id ? String(user.id) : 'user'}
    />
  )
}
