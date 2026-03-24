/**
 * Guest Shared Projects Dashboard
 * Public page — no auth required.
 * Shows all projects/threads the current browser has accessed via share links.
 */
'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FolderOpen, Share2, Clock, MessageSquare, Pencil } from 'lucide-react';
import { getSharedProjectSummaries } from '@/app/actions/share-links';
import type { SharedProjectSummary } from '@/app/actions/share-links';

const PERMISSION_CONFIG = {
  view: {
    label: 'View only',
    icon: FolderOpen,
    color: 'bg-gray-100 text-gray-600',
  },
  comment: {
    label: 'Can comment',
    icon: MessageSquare,
    color: 'bg-blue-50 text-blue-600',
  },
  draw_and_comment: {
    label: 'Can annotate',
    icon: Pencil,
    color: 'bg-purple-50 text-purple-600',
  },
} as const;

export default function SharedDashboard() {
  const router = useRouter();
  const [projects, setProjects] = useState<SharedProjectSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [guestName, setGuestName] = useState<string | null>(null);

  useEffect(() => {
    const name = localStorage.getItem('share_guest_name');
    setGuestName(name);

    let tokens: string[] = [];
    try {
      tokens = JSON.parse(localStorage.getItem('share_visited_tokens') || '[]');
    } catch { /* ignore */ }

    if (!tokens.length) {
      setIsLoading(false);
      return;
    }

    getSharedProjectSummaries(tokens)
      .then(setProjects)
      .catch(console.error)
      .finally(() => setIsLoading(false));
  }, []);

  const clearHistory = () => {
    localStorage.removeItem('share_visited_tokens');
    setProjects([]);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-border px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Share2 size={20} className="text-primary" />
            <div>
              <h1 className="text-base font-semibold">Shared Projects</h1>
              <p className="text-xs text-muted-foreground">
                Projects shared with{' '}
                {guestName ? (
                  <span className="font-medium text-foreground">{guestName}</span>
                ) : (
                  'you'
                )}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {guestName && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-xs font-semibold text-primary">
                  {guestName[0]?.toUpperCase()}
                </div>
                <span>{guestName}</span>
              </div>
            )}
            {projects.length > 0 && (
              <button
                onClick={clearHistory}
                className="text-xs text-muted-foreground hover:text-destructive transition-colors underline underline-offset-2"
              >
                Clear history
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-6xl mx-auto px-6 py-8">
        {isLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="bg-white rounded-2xl overflow-hidden shadow-sm animate-pulse"
              >
                <div className="aspect-square bg-gray-200" />
                <div className="p-3 space-y-2">
                  <div className="h-3 bg-gray-200 rounded w-3/4" />
                  <div className="h-3 bg-gray-100 rounded w-1/2" />
                </div>
              </div>
            ))}
          </div>
        ) : projects.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center gap-4">
            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
              <Share2 size={28} className="text-muted-foreground" />
            </div>
            <div>
              <p className="font-medium text-foreground">No shared projects yet</p>
              <p className="text-sm text-muted-foreground mt-1">
                When someone shares a project link with you, it will appear here.
              </p>
            </div>
          </div>
        ) : (
          <>
            <p className="text-sm text-muted-foreground mb-6">
              {projects.length} project{projects.length !== 1 ? 's' : ''} shared with you
            </p>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
              {projects.map((project) => {
                const perm = PERMISSION_CONFIG[project.permissions];
                const PermIcon = perm.icon;
                return (
                  <div
                    key={project.token}
                    className="bg-white rounded-2xl overflow-hidden shadow-sm hover:shadow-lg transition-all duration-300 flex flex-col group cursor-pointer"
                    onClick={() => router.push(`/share/${project.token}`)}
                  >
                    {/* Thumbnail */}
                    <div className="relative aspect-square overflow-hidden bg-gray-100 rounded-xl m-2">
                      {project.thumbnailUrl ? (
                        <img
                          src={project.thumbnailUrl}
                          alt={project.projectName}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          onError={(e) => {
                            e.currentTarget.src = '/placeholder.svg';
                          }}
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <FolderOpen size={32} className="text-gray-300" />
                        </div>
                      )}

                      {/* Open overlay */}
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center rounded-xl">
                        <span className="flex items-center gap-2 px-3 py-1.5 bg-white text-black rounded-lg text-sm font-medium">
                          <FolderOpen size={14} />
                          Open
                        </span>
                      </div>
                    </div>

                    {/* Info */}
                    <div className="px-3 pb-3 pt-1">
                      <p className="text-sm font-medium truncate">{project.projectName}</p>
                      <div className="flex items-center gap-1.5 mt-1.5">
                        <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${perm.color}`}>
                          <PermIcon size={10} />
                          {perm.label}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
