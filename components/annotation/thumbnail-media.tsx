'use client';

import { useState } from 'react';
import { FileText, Film, Globe } from 'lucide-react';
import { getMediaKind } from '@/lib/media-type';

/**
 * Thumbnail image, served straight from Supabase Storage.
 *
 * These deliberately bypass the Next.js image optimizer: at 128px the transform
 * buys very little, and routing 20+ multi-MB renders through `/_next/image`
 * made whole batches of tiles fail to render (the optimizer rejects or times out
 * under that load, and a failed entry stays failed). A plain lazy <img> always
 * paints, and the browser reuses these bytes for the full-size viewer.
 *
 * The retry covers a just-uploaded file that hasn't propagated through the
 * storage CDN yet: rather than leave a blank tile, retry a few times with a
 * cache-busting suffix so the image fills in on its own.
 */
function ThumbnailImage({ url, alt }: { url: string; alt: string }) {
  const [attempt, setAttempt] = useState(0);
  const base = url || '/placeholder.svg';
  const src = attempt > 0 ? `${base}${base.includes('?') ? '&' : '?'}retry=${attempt}` : base;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- optimizer bypassed on purpose, see above
    <img
      src={src}
      alt={alt}
      width={128}
      height={128}
      loading="lazy"
      decoding="async"
      className="w-full h-full object-cover"
      onError={() => {
        if (attempt < 3) {
          const delay = 800 * (attempt + 1);
          setTimeout(() => setAttempt(a => a + 1), delay);
        }
      }}
    />
  );
}

/**
 * A website page's tile: a rendering of the page as it first appears, made on
 * the server the first time it is asked for (which can take a few seconds).
 * The globe tile shows until it arrives, and stays if the page can't be
 * rendered.
 */
function PageThumbnail({ threadId, alt, shareToken }: { threadId: string; alt: string; shareToken?: string }) {
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading');
  const src = `/api/websites/thumbnail/${threadId}${shareToken ? `?token=${encodeURIComponent(shareToken)}` : ''}`;
  return (
    <>
      {state !== 'ready' && <MediaPlaceholder kind="page" />}
      {state !== 'failed' && (
        // eslint-disable-next-line @next/next/no-img-element -- served from Storage via redirect, see ThumbnailImage
        <img
          src={src}
          alt={alt}
          loading="lazy"
          decoding="async"
          className={`w-full h-full object-cover object-left-top ${state === 'ready' ? '' : 'absolute inset-0 opacity-0'}`}
          onLoad={() => setState('ready')}
          onError={() => setState('failed')}
        />
      )}
    </>
  );
}

/**
 * PDFs, videos, and website pages without a thumbnail get a labelled icon tile.
 */
function MediaPlaceholder({ kind }: { kind: 'pdf' | 'video' | 'page' }) {
  const Icon = kind === 'pdf' ? FileText : kind === 'video' ? Film : Globe;
  return (
    <div className="w-full h-full flex flex-col items-center justify-center gap-1 bg-gray-100 text-gray-500">
      <Icon className="h-6 w-6" />
      <span className="text-[9px] font-semibold uppercase tracking-wide">{kind}</span>
    </div>
  );
}

/**
 * The tile content for one project entry: the image itself, a website page
 * rendering, or a labelled placeholder for PDFs and videos.
 */
export function ThumbnailMedia({
  id,
  name,
  url,
  sourceUrl,
  shareToken,
}: {
  id: string;
  name: string;
  url: string;
  sourceUrl?: string | null;
  shareToken?: string;
}) {
  // A website review's page has a source URL but no stored image.
  const kind: 'image' | 'pdf' | 'video' | 'page' =
    !url && sourceUrl ? 'page' : getMediaKind(url, name);
  if (kind === 'image') return <ThumbnailImage url={url} alt={name} />;
  if (kind === 'page') return <PageThumbnail threadId={id} alt={name} shareToken={shareToken} />;
  return <MediaPlaceholder kind={kind} />;
}
