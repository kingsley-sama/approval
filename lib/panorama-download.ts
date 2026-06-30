/**
 * Panorama download utilities — mirror the pattern from image-viewer
 * but tailored for equirectangular panorama images.
 */

export function downloadPanoramaFileName(
  imageName: string | undefined,
  mimeType: string,
  url: string
): string {
  // Prefer the explicit image name if available.
  if (imageName?.trim()) {
    const base = imageName.replace(/[^\w\s.-]/g, '');
    const ext = mimeType === 'image/png' ? '.png' : mimeType === 'image/webp' ? '.webp' : '.jpg';
    return base + (base.toLowerCase().endsWith(ext) ? '' : ext);
  }

  // Fall back to 'panorama' + extension.
  const ext = mimeType === 'image/png' ? '.png' : mimeType === 'image/webp' ? '.webp' : '.jpg';
  return `panorama${ext}`;
}

/**
 * Download a panorama image by fetching as blob + triggering download,
 * which works even for cross-origin storage URLs.
 *
 * Falls back to opening in a new tab if download fails.
 */
export async function downloadPanorama(
  imageUrl: string,
  imageName: string | undefined,
  onStart?: () => void,
  onEnd?: () => void
): Promise<void> {
  onStart?.();
  try {
    const res = await fetch(imageUrl);
    if (!res.ok) throw new Error(`Download failed (${res.status})`);
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = objectUrl;
    a.download = downloadPanoramaFileName(imageName, blob.type, imageUrl);
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(objectUrl);
  } catch {
    // Fallback: open in new tab
    window.open(imageUrl, '_blank', 'noopener');
  } finally {
    onEnd?.();
  }
}
