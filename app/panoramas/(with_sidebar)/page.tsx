import { getPanoramaProjectsPage } from '@/app/actions/panorama-projects'
import { getUser } from '@/lib/db/queries'
import PanoramasDashboard from './panoramas-dashboard'

export default async function PanoramasPage() {
  const user = await getUser()
  const { projects, total } = await getPanoramaProjectsPage({ page: 1 })

  return (
    <PanoramasDashboard
      initialProjects={projects}
      initialTotal={total}
      isAdmin={user?.role === 'admin'}
      userEmail={user?.email || 'system'}
    />
  )
}
