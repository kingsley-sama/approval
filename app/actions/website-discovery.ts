'use server';

/**
 * Page discovery for a website review.
 *
 * Adding a review should not mean typing out every address on the site. This
 * asks the site what pages it has (sitemap, falling back to the links on the
 * entry page) and hands the list back for the reviewer to pick from.
 *
 * Discovery only ever reads. Nothing is added to the review until the reviewer
 * chooses, which keeps a 200-page sitemap from turning into 200 rows nobody
 * asked for.
 */

import { supabaseAdmin } from '@/lib/supabase';
import { requireUser } from '@/lib/auth/require-user';
import { discoverRoutes, DISCOVERY_LIMIT, type DiscoveredPage } from '@/lib/website/discover';

export interface DiscoveredPageStatus extends DiscoveredPage {
  /** Already a page of this review — shown ticked and disabled in the picker. */
  alreadyAdded: boolean;
}

export interface DiscoverPagesResult {
  success: boolean;
  pages: DiscoveredPageStatus[];
  sources: string[];
  truncated: boolean;
  error?: string;
}

export async function discoverWebsitePages(
  projectId: string
): Promise<DiscoverPagesResult> {
  await requireUser();

  const { data } = await supabaseAdmin
    .from('markup_projects')
    .select('id, kind, site_url')
    .eq('id', projectId)
    .maybeSingle();

  const project = data as { kind: string | null; site_url: string | null } | null;
  if (!project || project.kind !== 'website') {
    return { success: false, pages: [], sources: [], truncated: false, error: 'That project is not a website review.' };
  }
  if (!project.site_url) {
    return { success: false, pages: [], sources: [], truncated: false, error: 'This review has no site address recorded.' };
  }

  const result = await discoverRoutes(project.site_url, { limit: DISCOVERY_LIMIT });
  if (result.error) {
    return { success: false, pages: [], sources: [], truncated: false, error: result.error };
  }

  const { data: existingRows } = await supabaseAdmin
    .from('markup_threads')
    .select('source_url')
    .eq('project_id', projectId)
    .not('source_url', 'is', null);

  // Compare on a normalised form so "/about" and "/about/" are not offered as
  // two different pages to add.
  const canonical = (raw: string) => {
    try {
      const u = new URL(raw);
      u.hash = '';
      if (u.pathname.length > 1 && u.pathname.endsWith('/')) {
        u.pathname = u.pathname.replace(/\/+$/, '');
      }
      return u.toString();
    } catch {
      return raw;
    }
  };

  const existing = new Set(
    ((existingRows ?? []) as { source_url: string | null }[])
      .map((r) => (r.source_url ? canonical(r.source_url) : null))
      .filter((v): v is string => Boolean(v))
  );

  return {
    success: true,
    pages: result.pages.map((p) => ({ ...p, alreadyAdded: existing.has(canonical(p.url)) })),
    sources: result.sources,
    truncated: result.truncated,
  };
}
