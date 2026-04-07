'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Archive, FolderOpen } from 'lucide-react'
import { getCurrentUser } from '@/app/actions/comments'

export default function ArchivePage() {
  const router = useRouter()
  const [isAuthorized, setIsAuthorized] = useState(false)

  useEffect(() => {
    getCurrentUser().then(u => {
      if (!u || u.role !== 'admin') {
        router.replace('/projects')
        return
      }
      setIsAuthorized(true)
    })
  }, [router])

  if (!isAuthorized) return null

  return (
    <div className="p-6 md:p-8 max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-8">
        <Archive className="h-5 w-5 text-muted-foreground" />
        <h1 className="text-lg font-semibold text-foreground font-display">Archive</h1>
        <span className="ml-2 text-[10px] px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-semibold">Beta</span>
      </div>

      <div className="border border-border rounded-xl bg-card overflow-hidden">
        <div className="px-5 py-4 border-b border-border">
          <h2 className="text-sm font-semibold">Archived projects</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Projects moved to the archive are hidden from the main dashboard but remain accessible here.
          </p>
        </div>

        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-3">
          <FolderOpen className="h-10 w-10 opacity-30" />
          <p className="text-sm">No archived projects yet.</p>
          <p className="text-xs max-w-xs text-center opacity-70">
            Archive a project from the dashboard by opening its <strong>More actions</strong> menu.
          </p>
        </div>
      </div>
    </div>
  )
}
