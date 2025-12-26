'use client'

import { Home, Archive, Users, Zap, Settings, LogOut } from 'lucide-react'

interface SidebarItem {
  icon: React.ReactNode
  label: string
  href: string
  badge?: string
}

const sidebarItems: SidebarItem[] = [
  { icon: <Home size={20} />, label: 'Dashboard', href: '#' },
  { icon: <Archive size={20} />, label: 'Archive', href: '#', badge: 'Beta' },
  { icon: <Users size={20} />, label: 'Team', href: '#' },
  { icon: <Settings size={20} />, label: 'Settings', href: '/settings' },
]

export default function Sidebar() {
  return (
    <aside className="w-64 bg-sidebar border-r border-sidebar-border h-screen flex flex-col p-6">
      {/* Header */}
      <div className="mb-8 flex items-center gap-2">
        <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
          <span className="text-primary-foreground font-bold text-sm">M</span>
        </div>
        <div>
          <h2 className="font-bold text-lg text-sidebar-foreground">MarkUp</h2>
          <p className="text-xs text-muted-foreground">Pro</p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-2">
        {sidebarItems.map((item, index) => (
          <a
            key={index}
            href={item.href}
            className="flex items-center gap-3 px-4 py-3 text-sidebar-foreground rounded-lg hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
          >
            <span className="text-sidebar-foreground">{item.icon}</span>
            <span className="text-sm font-medium flex-1">{item.label}</span>
            {item.badge && (
              <span className="text-xs bg-purple-500 text-white px-2 py-1 rounded-full">
                {item.badge}
              </span>
            )}
          </a>
        ))}
      </nav>

      {/* Footer */}
      <div className="pt-6 border-t border-sidebar-border">
        <button className="flex items-center gap-3 px-4 py-3 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors w-full rounded-lg">
          <LogOut size={20} />
          <span className="text-sm font-medium">Logout</span>
        </button>
      </div>
    </aside>
  )
}
