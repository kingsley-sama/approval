'use server';

import { createClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireUser } from '@/lib/auth/require-user';
import { SignedUploadUrlSchema, RegisterPanoramaImageSchema } from '@/lib/validation/schemas';
import { revalidatePath, unstable_noStore as noStore } from 'next/cache';
import { getPanoramaCommentsForImages, type PanoramaComment } from './panorama-comments';

const BUCKET = process.env.NEXT_PUBLIC_SUPABASE_BUCKET_NAME || 'screenshots';

function panoramaStoragePath(projectId: string, fileName: string): string {
  const timestamp = Date.now();
  const sanitized = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  return `panoramas/${projectId}/${timestamp}-${sanitized}`;
}

export interface PanoramaWorkspaceData {
  projectName: string | null;
  images: any[];
  commentsByImage: Record<string, PanoramaComment[]>;
  currentUser: { name: string; role: string };
}

/** Everything the panorama workspace needs in one server call. */
export async function getPanoramaWorkspaceData(projectId: string): Promise<PanoramaWorkspaceData> {
  noStore();
  const user = await requireUser();
  const supabase = await createClient();

  const [imagesRes, projectRes] = await Promise.all([
    supabase
      .from('panorama_images')
      .select('*')
      .eq('panorama_project_id', projectId)
      .order('image_index', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: true }),
    supabase
      .from('panorama_projects')
      .select('project_name')
      .eq('id', projectId)
      .maybeSingle(),
  ]);

  if (imagesRes.error) {
    console.error('Error fetching panorama images:', imagesRes.error);
  }
  const images = imagesRes.data ?? [];
  const commentsByImage = await getPanoramaCommentsForImages(images.map((i: any) => i.id));

  return {
    projectName: (projectRes.data as { project_name: string | null } | null)?.project_name ?? null,
    images,
    commentsByImage,
    currentUser: { name: user.name || user.email, role: user.role ?? 'member' },
  };
}

export interface SignedUploadUrlResult {
  success: boolean;
  signedUrl?: string;
  storagePath?: string;
  error?: string;
}

/** Step 1 — presigned upload URL for a panorama image (direct browser → Supabase). */
export async function getPanoramaUploadUrl(
  projectId: string,
  fileName: string,
): Promise<SignedUploadUrlResult> {
  try {
    await requireUser();

    const parsed = SignedUploadUrlSchema.safeParse({ fileName });
    if (!parsed.success) return { success: false, error: 'Invalid file name' };

    const storagePath = panoramaStoragePath(projectId, fileName);
    const { data, error } = await supabaseAdmin.storage
      .from(BUCKET)
      .createSignedUploadUrl(storagePath);

    if (error || !data?.signedUrl) {
      return { success: false, error: error?.message || 'Could not create signed URL' };
    }
    return { success: true, signedUrl: data.signedUrl, storagePath };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to generate upload URL' };
  }
}

export interface RegisterPanoramaImageResult {
  success: boolean;
  publicUrl?: string;
  image?: any;
  error?: string;
}

/** Step 2 — after upload, register the panorama image row + bump project counts. */
export async function registerPanoramaImage(
  projectId: string,
  fileName: string,
  storagePath: string,
): Promise<RegisterPanoramaImageResult> {
  await requireUser();

  const parsed = RegisterPanoramaImageSchema.safeParse({ projectId, fileName, storagePath });
  if (!parsed.success) {
    return { success: false, error: 'Invalid input: ' + parsed.error.issues[0]?.message };
  }

  const { data: pub } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(storagePath);
  const publicUrl = pub?.publicUrl;
  if (!publicUrl) return { success: false, error: 'Could not resolve public URL' };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('panorama_images')
    .insert({
      panorama_project_id: projectId,
      image_path: publicUrl,
      name: fileName,
      image_filename: fileName,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } as any)
    .select()
    .single();

  if (error) {
    console.error('Error registering panorama image:', error);
    return { success: false, error: error.message };
  }

  // Update image count and set the project preview to the first image.
  const { count } = await supabase
    .from('panorama_images')
    .select('*', { count: 'exact', head: true })
    .eq('panorama_project_id', projectId);

  const projectUpdate: Record<string, unknown> = {
    total_images: count ?? 0,
    updated_at: new Date().toISOString(),
  };
  if ((count ?? 0) <= 1) projectUpdate.preview_url = publicUrl;

  await supabase.from('panorama_projects').update(projectUpdate).eq('id', projectId);

  revalidatePath(`/panoramas/${projectId}`);
  return { success: true, publicUrl, image: data };
}

/** Persist a drag-reordered image list for a panorama project. */
export async function reorderPanoramaImages(projectId: string, orderedImageIds: string[]) {
  await requireUser();

  if (!projectId || !Array.isArray(orderedImageIds) || orderedImageIds.length === 0) {
    return { success: false, error: 'Invalid reorder request' };
  }

  const supabase = await createClient();
  const now = new Date().toISOString();
  const results = await Promise.all(
    orderedImageIds.map((id, index) =>
      supabase
        .from('panorama_images')
        .update({ image_index: index, updated_at: now })
        .eq('id', id)
        .eq('panorama_project_id', projectId)
    )
  );

  const failed = results.find(r => r.error);
  if (failed?.error) {
    console.error('Error reordering panorama images:', failed.error);
    return { success: false, error: failed.error.message };
  }

  revalidatePath(`/panoramas/${projectId}`);
  return { success: true };
}
