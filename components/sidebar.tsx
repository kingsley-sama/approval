'use client'
import React from 'react'
import { Users, Settings, ChevronDown, LogOut, Folder, Trash } from 'lucide-react'
import { signOut } from '@/app/actions/auth'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup,
  SidebarGroupContent, SidebarHeader, SidebarMenu,
  SidebarMenuButton, SidebarMenuItem,
} from '@/components/ui/sidebar'
import type { users } from '@/lib/db/schema'
interface NavItem {
  title: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
}

const adminNavItems: NavItem[] = [
  { title: 'Projects', href: '/projects', icon: Folder },
  { title: 'Team', href: '/team', icon: Users },
  { title: 'Archive', href: '/archive', icon: Trash, badge: 'Beta' },
  { title: 'Settings', href: '/settings', icon: Settings },
]

const memberNavItems: NavItem[] = [
  { title: 'Projects', href: '/projects', icon: Folder },
]

interface AppSidebarProps {
  user: typeof users.$inferSelect | null
}


function getInitials(name?: string | null, email?: string | null) {
  if (name) {
    return name.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase()
  }
  return email?.[0]?.toUpperCase() ?? '?'
}

export default function AppSidebar({ user }: AppSidebarProps) {
  const pathname = usePathname()
  const navItems = user?.role === 'admin' ? adminNavItems : memberNavItems

  return (
    <Sidebar collapsible="icon" className="border-r border-border">
      {/* Header */}
      <SidebarHeader className="p-4">
        <button className="flex items-center gap-3 w-full group">
          <div className="h-9 w-9 rounded-lg flex items-center justify-center shrink-0">
            <Image
              src="/logo.png"
              alt="Company logo"
              width={20}
              height={20}
              className="object-contain"
            />
          </div>
          <div className="flex-1 text-left min-w-0 group-data-[collapsible=icon]:hidden">
            <p className="text-sm font-semibold text-foreground truncate">Revision</p>
            <p className="text-xs text-accent font-medium">Pro</p>
          </div>
          <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0 group-data-[collapsible=icon]:hidden" />
        </button>
      </SidebarHeader>

      {/* Navigation */}
      <SidebarContent className="px-2">
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild isActive={pathname === item.href || pathname.startsWith(item.href + '/')} tooltip={item.title}>
                    <Link
                      href={item.href}
                      className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-muted-foreground transition-colors hover:text-foreground hover:bg-muted"
                    >
                      <item.icon className="h-[18px] w-[18px] shrink-0" />
                      <span>{item.title}</span>
                      {item.badge && (
                        <Badge
                          variant="secondary"
                          className="ml-auto text-[10px] px-1.5 py-0 h-5 bg-green-100 text-green-700 border-0 font-medium"
                        >
                          {item.badge}
                        </Badge>
                      )}
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      {/* Footer */}
        {/* Footer */}
<SidebarFooter className="p-3 border-t border-border">
  {/* User profile */}
  <div className="flex items-center gap-3 p-2 rounded-xl group-data-[collapsible=icon]:justify-center ">
    <div className="relative shrink-0">
      <Avatar className="h-8 w-8 ring-2 ring-accent/20">
        <AvatarImage src={user?.avatarUrl ?? '/apple-icon.png'} alt={user?.name ?? 'User'} />
        <AvatarFallback className="bg-accent/20 text-accent text-xs font-semibold">
          {getInitials(user?.name, user?.email)}
        </AvatarFallback>
      </Avatar>
      {/* Online indicator */}
      <span className="absolute bottom-0 right-0 h-2 w-2 rounded-full bg-accent ring-2 ring-background" />
    </div>
    <div className="flex-1 min-w-0 group-data-[collapsible=icon]:hidden">
      {user?.name && (
        <p className="text-sm font-semibold text-foreground truncate">{user.name}</p>
      )}
      {user?.email && (
        <p className="text-xs text-muted-foreground truncate">{user.email}</p>
      )}
    </div>
  </div>

  {/* Logout */}
  <form action={signOut} className="mt-1">
    <button
      type="submit"
      className="flex items-center gap-3 px-3 py-2 text-muted-foreground hover:text-accent hover:bg-accent/10 transition-colors w-full rounded-lg text-sm font-medium group/logout"
    >
      <LogOut className="h-[18px] w-[18px] shrink-0 group-hover/logout:text-accent transition-colors" />
      <span className="group-data-[collapsible=icon]:hidden">Logout</span>
    </button>
  </form>
</SidebarFooter>
    </Sidebar>
  )
}