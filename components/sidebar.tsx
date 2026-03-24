'use client'

import { Home, Archive, Users, Settings, ChevronDown, MessageCircle, HelpCircle, Map, LogOut } from 'lucide-react'
import { signOut } from '@/app/actions/auth'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar'

const navItems = [
  { title: 'Dashboard', href: '/', icon: Home },
  { title: 'Archive', href: '/archive', icon: Archive, badge: 'Beta' },
  { title: 'Team', href: '/team', icon: Users },
  { title: 'Settings', href: '/settings', icon: Settings },
]

const footerLinks = [
  { title: 'Live Chat', icon: MessageCircle },
  { title: 'Help Center', icon: HelpCircle },
  { title: 'Roadmap', icon: Map },
]

export default function AppSidebar() {
  const pathname = usePathname()

  return (
    <Sidebar collapsible="icon" className="border-r border-border">
      {/* Header */}
      <SidebarHeader className="p-4">
        <button className="flex items-center gap-3 w-full group">
          <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center text-white font-display font-bold text-sm shrink-0">
            EP
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
                  <SidebarMenuButton
                    asChild
                    isActive={pathname === item.href}
                    tooltip={item.title}
                  >
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
      <SidebarFooter className="p-4 border-t border-border space-y-3">
        <div className="flex items-center gap-4 text-xs text-muted-foreground group-data-[collapsible=icon]:hidden">
          {footerLinks.map((link) => (
            <button
              key={link.title}
              className="hover:text-foreground transition-colors whitespace-nowrap"
            >
              {link.title}
            </button>
          ))}
        </div>
        <form action={signOut}>
          <button
            type="submit"
            className="flex items-center gap-3 px-3 py-2 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors w-full rounded-lg text-sm font-medium"
          >
            <LogOut className="h-[18px] w-[18px] shrink-0" />
            <span className="group-data-[collapsible=icon]:hidden">Logout</span>
          </button>
        </form>
      </SidebarFooter>
    </Sidebar>
  )
}