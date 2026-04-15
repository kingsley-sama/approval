/**
 * Utilities for generating optimized image URLs from Supabase Storage.
 *
 * Supabase Image Transformations rewrite the public URL path from
 *   /storage/v1/object/public/…
 * to
 *   /storage/v1/render/image/public/…
 * and accept query parameters like ?width=400&quality=75.
 *
 * If the input URL is not a Supabase storage URL the original is returned
 * unchanged so callers never need to guard.
 */

export interface ImageSizePreset {
  width: number;
  quality: number;
}

export const IMAGE_SIZES = {
  DASHBOARD_THUMB: { width: 400, quality: 75 } as ImageSizePreset,
  SIDEBAR_THUMB: { width: 200, quality: 60 } as ImageSizePreset,
} as const;

const SUPABASE_PUBLIC_PREFIX = '/storage/v1/object/public/';
const SUPABASE_RENDER_PREFIX = '/storage/v1/render/image/public/';

/**
 * Rewrites a Supabase public storage URL to use the image transformation
 * endpoint. Non-Supabase URLs (placeholders, local paths) are returned as-is.
 *
 * If Supabase Image Transformations are not available (Free plan), the render
 * endpoint returns an error. Set `NEXT_PUBLIC_SUPABASE_IMAGE_TRANSFORMS=true`
 * to enable URL rewriting. When disabled (default), the original URL is
 * returned and Next.js `<Image>` handles optimisation via its own optimizer.
 */
export function getOptimizedImageUrl(
  url: string | null | undefined,
  opts?: ImageSizePreset,
): string {
  if (!url) return '/placeholder.svg';

  const transformsEnabled =
    typeof window !== 'undefined'
      ? process.env.NEXT_PUBLIC_SUPABASE_IMAGE_TRANSFORMS === 'true'
      : process.env.NEXT_PUBLIC_SUPABASE_IMAGE_TRANSFORMS === 'true';

  if (!transformsEnabled) return url;

  // Only transform Supabase storage public URLs
  if (!url.includes(SUPABASE_PUBLIC_PREFIX)) return url;

  const transformed = url.replace(SUPABASE_PUBLIC_PREFIX, SUPABASE_RENDER_PREFIX);

  if (!opts) return transformed;

  const params = new URLSearchParams();
  if (opts.width) params.set('width', String(opts.width));
  if (opts.quality) params.set('quality', String(opts.quality));

  return `${transformed}?${params.toString()}`;
}
