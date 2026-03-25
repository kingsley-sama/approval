// app/layout.tsx
import { SidebarProvider } from '@/components/ui/sidebar'
import { getUser } from '@/app/actions/auth'
import AppSidebar from '@/components/sidebar'

export default async function Layout({ children }: { children: React.ReactNode }) {
  const user = await getUser()
  return (
    <SidebarProvider>
      <div className="flex h-screen w-full">
        <AppSidebar user={user} />
        <main className="flex-1 overflow-auto">{children}</main>
      </div>
    </SidebarProvider>
  )
}