'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Users, Mail, ShieldCheck, User, Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { getCurrentUser } from '@/app/actions/comments'
import { getTeamMembers } from '@/app/actions/team'

interface TeamMember {
  id: string
  name: string | null
  email: string
  role: string
  createdAt: Date
}

function RoleBadge({ role }: { role: string }) {
  const isAdmin = role === 'admin'
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-semibold ${
      isAdmin ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
    }`}>
      {isAdmin ? <ShieldCheck className="h-3 w-3" /> : <User className="h-3 w-3" />}
      {isAdmin ? 'Admin' : 'Member'}
    </span>
  )
}

export default function TeamPage() {
  const router = useRouter()
  const [members, setMembers] = useState<TeamMember[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isAuthorized, setIsAuthorized] = useState(false)
  const [search, setSearch] = useState('')
  const [inviteEmail, setInviteEmail] = useState('')

  useEffect(() => {
    getCurrentUser().then(u => {
      if (!u || u.role !== 'admin') {
        router.replace('/projects')
        return
      }
      setIsAuthorized(true)
      getTeamMembers().then(data => {
        setMembers(data)
        setIsLoading(false)
      })
    })
  }, [router])

  const filtered = members.filter(m =>
    m.email.toLowerCase().includes(search.toLowerCase()) ||
    (m.name ?? '').toLowerCase().includes(search.toLowerCase())
  )

  if (!isAuthorized) return null

  return (
    <div className="p-6 md:p-8 max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-8">
        <Users className="h-5 w-5 text-muted-foreground" />
        <h1 className="text-lg font-semibold text-foreground font-display">Team</h1>
        <span className="ml-auto text-sm text-muted-foreground">{members.length} member{members.length !== 1 ? 's' : ''}</span>
      </div>

      {/* Invite row */}
      <div className="border border-border rounded-xl p-5 bg-card mb-6 space-y-3">
        <h2 className="text-sm font-semibold">Invite a new member</h2>
        <p className="text-xs text-muted-foreground">
          New members sign up at <code className="bg-muted px-1 rounded">/sign-up</code> — their role defaults to <strong>member</strong>. Use this to look up existing members and manage project access below.
        </p>
        <div className="flex gap-2">
          <Input
            placeholder="member@example.com"
            value={inviteEmail}
            onChange={e => setInviteEmail(e.target.value)}
            className="max-w-xs h-9 text-sm"
          />
          <Button size="sm" disabled className="h-9 text-xs">
            <Mail className="h-3.5 w-3.5 mr-1.5" />
            Send invite
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">Email invitations coming soon.</p>
      </div>

      {/* Search + list */}
      <div className="border border-border rounded-xl bg-card overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-center gap-2">
          <Search className="h-4 w-4 text-muted-foreground shrink-0" />
          <Input
            placeholder="Search members…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="border-0 shadow-none focus-visible:ring-0 h-7 text-sm p-0 bg-transparent"
          />
        </div>

        {isLoading ? (
          <div className="divide-y divide-border">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="px-5 py-4 flex items-center gap-3 animate-pulse">
                <div className="h-8 w-8 rounded-full bg-muted-foreground/10 shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3.5 w-1/3 bg-muted-foreground/10 rounded" />
                  <div className="h-3 w-1/2 bg-muted-foreground/10 rounded" />
                </div>
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-muted-foreground">
            {search ? `No members match "${search}"` : 'No team members yet.'}
          </div>
        ) : (
          <div className="divide-y divide-border">
            {filtered.map(member => {
              const initials = member.name
                ? member.name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()
                : member.email[0].toUpperCase()
              return (
                <div key={member.id} className="px-5 py-4 flex items-center gap-4">
                  <div className="h-8 w-8 rounded-full bg-accent/20 text-accent flex items-center justify-center text-xs font-bold shrink-0">
                    {initials}
                  </div>
                  <div className="flex-1 min-w-0">
                    {member.name && (
                      <p className="text-sm font-medium text-foreground truncate">{member.name}</p>
                    )}
                    <p className="text-xs text-muted-foreground truncate">{member.email}</p>
                  </div>
                  <RoleBadge role={member.role} />
                  <span className="text-xs text-muted-foreground hidden sm:block">
                    Joined {new Date(member.createdAt).toLocaleDateString()}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
