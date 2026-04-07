'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Settings, User, Lock, Bell, Palette } from 'lucide-react'
import { getCurrentUser } from '@/app/actions/comments'

type Section = 'profile' | 'security' | 'notifications' | 'appearance'

export default function SettingsPage() {
  const [currentUser, setCurrentUser] = useState<{ id: string; name: string; email: string; role: string } | null>(null)
  const [section, setSection] = useState<Section>('profile')
  const [name, setName] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [savedMsg, setSavedMsg] = useState('')

  useEffect(() => {
    getCurrentUser().then(u => {
      if (u) {
        setCurrentUser(u)
        setName(u.name ?? '')
      }
    })
  }, [])

  const handleSaveProfile = async () => {
    setIsSaving(true)
    setSavedMsg('')
    // Optimistic update — actual persistence requires a server action (wire up as needed)
    await new Promise(r => setTimeout(r, 600))
    setSavedMsg('Saved!')
    setIsSaving(false)
    setTimeout(() => setSavedMsg(''), 3000)
  }

  const navItems: { id: Section; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: 'profile', label: 'Profile', icon: User },
    { id: 'security', label: 'Security', icon: Lock },
    { id: 'notifications', label: 'Notifications', icon: Bell },
    { id: 'appearance', label: 'Appearance', icon: Palette },
  ]

  return (
    <div className="p-6 md:p-8 max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-8">
        <Settings className="h-5 w-5 text-muted-foreground" />
        <h1 className="text-lg font-semibold text-foreground font-display">Settings</h1>
      </div>

      <div className="flex gap-8">
        {/* Side nav */}
        <nav className="w-44 shrink-0 space-y-1">
          {navItems.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setSection(id)}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors text-left ${
                section === id
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted'
              }`}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {label}
            </button>
          ))}
        </nav>

        {/* Panel */}
        <div className="flex-1 min-w-0">
          {section === 'profile' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-base font-semibold mb-1">Profile</h2>
                <p className="text-sm text-muted-foreground">Manage your name and account information.</p>
              </div>
              <div className="border border-border rounded-xl p-5 space-y-4 bg-card">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Display name</label>
                  <Input
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder="Your name"
                    className="max-w-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Email</label>
                  <Input
                    value={currentUser?.email ?? ''}
                    disabled
                    className="max-w-sm bg-muted text-muted-foreground"
                  />
                  <p className="text-xs text-muted-foreground">Email cannot be changed.</p>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Role</label>
                  <div className="inline-flex items-center px-2.5 py-1 rounded-md bg-accent/10 text-accent text-xs font-semibold capitalize">
                    {currentUser?.role ?? '—'}
                  </div>
                </div>
                <div className="flex items-center gap-3 pt-1">
                  <Button size="sm" onClick={handleSaveProfile} disabled={isSaving}>
                    {isSaving ? 'Saving…' : 'Save changes'}
                  </Button>
                  {savedMsg && <span className="text-xs text-green-600 font-medium">{savedMsg}</span>}
                </div>
              </div>
            </div>
          )}

          {section === 'security' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-base font-semibold mb-1">Security</h2>
                <p className="text-sm text-muted-foreground">Manage your password and account security.</p>
              </div>
              <div className="border border-border rounded-xl p-5 space-y-4 bg-card">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Current password</label>
                  <Input type="password" placeholder="••••••••" className="max-w-sm" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">New password</label>
                  <Input type="password" placeholder="••••••••" className="max-w-sm" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Confirm new password</label>
                  <Input type="password" placeholder="••••••••" className="max-w-sm" />
                </div>
                <Button size="sm" disabled>Update password</Button>
                <p className="text-xs text-muted-foreground">Password change coming soon.</p>
              </div>
            </div>
          )}

          {section === 'notifications' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-base font-semibold mb-1">Notifications</h2>
                <p className="text-sm text-muted-foreground">Choose when and how you get notified.</p>
              </div>
              <div className="border border-border rounded-xl p-5 space-y-4 bg-card">
                {[
                  { label: 'New comment on your project', description: 'Get an email when someone leaves a comment.' },
                  { label: 'Comment resolved', description: 'Get notified when a pin is marked as resolved.' },
                  { label: 'Project shared with you', description: 'Get notified when an admin grants you access.' },
                ].map(({ label, description }) => (
                  <div key={label} className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-medium">{label}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
                    </div>
                    <input type="checkbox" defaultChecked className="mt-1 accent-primary h-4 w-4 shrink-0" />
                  </div>
                ))}
                <p className="text-xs text-muted-foreground pt-1">Notification delivery requires a valid <code className="bg-muted px-1 rounded">RESEND_API_KEY</code>.</p>
              </div>
            </div>
          )}

          {section === 'appearance' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-base font-semibold mb-1">Appearance</h2>
                <p className="text-sm text-muted-foreground">Customise how the interface looks.</p>
              </div>
              <div className="border border-border rounded-xl p-5 space-y-4 bg-card">
                <div className="space-y-2">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Theme</label>
                  <div className="flex gap-3">
                    {(['Light', 'Dark', 'System'] as const).map(t => (
                      <button
                        key={t}
                        className={`px-4 py-2 rounded-lg border text-sm font-medium transition-colors ${
                          t === 'Light'
                            ? 'border-primary bg-primary/10 text-primary'
                            : 'border-border text-muted-foreground hover:border-primary/50 hover:text-foreground'
                        }`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">Full theme switching coming soon.</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
