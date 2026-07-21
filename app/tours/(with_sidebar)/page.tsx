import { getTourProjectsPage } from '@/app/actions/tour-projects'
import { getUser } from '@/lib/db/queries'
import ToursDashboard from './tours-dashboard'

export default async function ToursPage() {
  const user = await getUser()
  const { projects, total } = await getTourProjectsPage({ page: 1 })

  return (
    <ToursDashboard
      initialProjects={projects}
      initialTotal={total}
      isAdmin={user?.role === 'admin'}
    />
  )
}
