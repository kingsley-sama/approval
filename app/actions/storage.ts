'use server';

import { supabaseAdmin } from '@/lib/supabase';
import { createThread } from './threads';

// ─── shared helpers ────────────────────────────────────────────────────────────

const BUCKET = process.env.NEXT_PUBLIC_SUPABASE_BUCKET_NAME || 'screenshots';

function generateStoragePath(fileName: string): string {
  const timestamp = Date.now();
  const sanitizedName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
  return `shared/${timestamp}-${sanitizedName}`;
}

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface SignedUploadUrlResult {
  success: boolean;
  signedUrl?: string;
  storagePath?: string;
  error?: string;
}

export interface RegisterThreadResult {
  success: boolean;
  publicUrl?: string;
  error?: string;
}

export interface UploadFileResult {
  success: boolean;
  upload?: { publicUrl: string; path: string; fileName: string };
  error?: string;
}

export interface UploadMultipleResult {
  successfulUploads: Array<{ publicUrl: string; path: string; fileName: string }>;
  failedUploads: Array<{ fileName: string; error: string }>;
  threadsCreated: number;
}

// ─── Step 1: Server issues a presigned upload URL ──────────────────────────────
// No file data crosses Next.js — just a tiny JSON response.

export async function getSignedUploadUrl(
  fileName: string,
): Promise<SignedUploadUrlResult> {
  try {
    const storagePath = generateStoragePath(fileName);

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

// ─── Step 2: After the client uploads, register the thread in the DB ───────────

export async function registerUploadedFile(
  projectId: string,
  fileName: string,
  storagePath: string,
): Promise<RegisterThreadResult> {
  try {
    const publicUrl = supabaseAdmin.storage
      .from(BUCKET)
      .getPublicUrl(storagePath).data.publicUrl;

    const result = await createThread(projectId, {
      path: publicUrl,
      name: fileName,
      filename: storagePath,
    });

    if (!result.success) {
      return { success: false, error: result.error || 'Thread creation failed' };
    }

    return { success: true, publicUrl };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to register file' };
  }
}

