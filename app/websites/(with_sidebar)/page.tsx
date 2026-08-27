import { getWebsiteProjectsPage } from '@/app/actions/website-projects'
import { getUser } from '@/lib/db/queries'
import WebsitesDashboard from './websites-dashboard'

export const metadata = { title: 'Websites' }

export default async function WebsitesPage() {
  const user = await getUser()
  const { projects, total } = await getWebsiteProjectsPage({ page: 1 })

  return (
    <WebsitesDashboard
      initialProjects={projects}
      initialTotal={total}
      isAdmin={user?.role === 'admin'}
      currentUserId={user?.email || 'system'}
    />
  )
}
