'use client';

import { useEffect, useState } from 'react';
import {
  getWebsiteAccessList,
  grantWebsiteAccess,
  revokeWebsiteAccess,
} from '@/app/actions/website-projects';
import { getTeamMembers } from '@/app/actions/team';
import { Switch } from '@/components/ui/switch';
import { Loader2 } from 'lucide-react';

interface TeamMember {
  id: string;
  name: string | null;
  email: string;
  role: string;
}

/**
 * Giving a website review to a colleague.
 *
 * Members only see the reviews they have been granted, and the grant table was
 * previously written by exactly one thing: a logged-in user opening a client
 * share link. That left an admin with no way to hand a review to a teammate,
 * and the teammate with a workspace whose frame refused to load. This is the
 * missing half.
 *
 * Admins are not listed — they can already open every review, so a toggle for
 * them would be a lie.
 */
export default function WebsiteTeamAccess({ projectId }: { projectId: string }) {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [granted, setGranted] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [team, access] = await Promise.all([
          getTeamMembers(),
          getWebsiteAccessList(projectId),
        ]);
        if (cancelled) return;
        setMembers((team as TeamMember[]).filter((m) => m.role !== 'admin'));
        if (access.success) setGranted(new Set(access.emails));
      } catch {
        if (!cancelled) setError('Team list could not be loaded.');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const toggle = async (email: string, next: boolean) => {
    setBusy(email);
    setError('');
    const result = next
      ? await grantWebsiteAccess(projectId, email)
      : await revokeWebsiteAccess(projectId, email);
    setBusy(null);

    if (!result.success) {
      setError(result.error ?? 'That change could not be saved.');
      return;
    }
    setGranted((prev) => {
      const copy = new Set(prev);
      if (next) copy.add(email);
      else copy.delete(email);
      return copy;
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Loading team…
      </div>
    );
  }

  return (
    <div className="space-y-4 py-4 border-b">
      <div className="space-y-1">
        <h3 className="font-semibold">Team access</h3>
        <p className="text-sm text-muted-foreground">
          Members see only the reviews you give them. Admins already see everything.
        </p>
      </div>

      {members.length === 0 ? (
        <p className="text-sm text-muted-foreground">No members on the team yet.</p>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {members.map((member) => (
            <li key={member.id} className="flex items-center justify-between gap-3 px-3 py-2">
              <div className="min-w-0">
                <p className="truncate text-sm">{member.name || member.email}</p>
                {member.name && (
                  <p className="truncate text-xs text-muted-foreground">{member.email}</p>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {busy === member.email && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
                <Switch
                  checked={granted.has(member.email)}
                  onCheckedChange={(next) => toggle(member.email, next)}
                  disabled={busy !== null}
                  aria-label={`Give ${member.email} access to this review`}
                />
              </div>
            </li>
          ))}
        </ul>
      )}

      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
