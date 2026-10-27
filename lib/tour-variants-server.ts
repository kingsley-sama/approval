import { supabaseAdmin } from '@/lib/supabase';
import { parsePublicStorageUrl, webVariantPath, webVariantUrl } from '@/lib/tour-variants';

/**
 * Resolve which scenes already have a web variant (see lib/tour-variants.ts)
 * and attach its URL as `web_url` (null when missing). One storage listing per
 * distinct `web/` folder — normally a single call per tour. Listing failures
 * degrade to `web_url: null`, so viewers simply fall back to the original.
 */
export async function withWebVariants<T extends { image_path: string }>(
  scenes: T[],
): Promise<(T & { web_url: string | null })[]> {
  // folder key (bucket + web dir) → names present in it
  const folders = new Map<string, { bucket: string; dir: string; names?: Set<string> }>();
  const lookups = scenes.map((scene) => {
    const parsed = parsePublicStorageUrl(scene.image_path);
    if (!parsed) return null;
    const variant = webVariantPath(parsed.path);
    const slash = variant.lastIndexOf('/');
    const dir = variant.slice(0, slash);
    const key = `${parsed.bucket}:${dir}`;
    if (!folders.has(key)) folders.set(key, { bucket: parsed.bucket, dir });
    return { key, name: variant.slice(slash + 1) };
  });

  await Promise.all(
    [...folders.values()].map(async (folder) => {
      try {
        const { data, error } = await supabaseAdmin.storage
          .from(folder.bucket)
          .list(folder.dir, { limit: 1000 });
        if (error) throw error;
        folder.names = new Set((data ?? []).map((f) => f.name));
      } catch (err) {
        console.error('[tour-variants] listing failed for', folder.dir, err);
      }
    }),
  );

  return scenes.map((scene, i) => {
    const lookup = lookups[i];
    const exists = !!lookup && !!folders.get(lookup.key)?.names?.has(lookup.name);
    return { ...scene, web_url: exists ? webVariantUrl(scene.image_path) : null };
  });
}
