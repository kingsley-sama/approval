import { z } from 'zod';

export const CreateCommentSchema = z.object({
  threadId: z.string().min(1),
  content: z.string().min(1).max(5000),
  userName: z.string().min(1).max(200),
  x: z.number().min(0).max(100),
  y: z.number().min(0).max(100),
  drawingData: z.any().optional(),
});

export const ResolveCommentSchema = z.object({
  commentId: z.string().min(1),
});

export const DeleteCommentSchema = z.object({
  commentId: z.string().min(1),
});

export const UpdateCommentPositionSchema = z.object({
  commentId: z.string().min(1),
  x: z.number().min(0).max(100),
  y: z.number().min(0).max(100),
});

export const UpdateCommentContentSchema = z.object({
  commentId: z.string().min(1),
  content: z.string().min(1).max(5000),
});

export const CreateThreadSchema = z.object({
  projectId: z.string().uuid(),
  fileData: z.object({
    path: z.string().url(),
    name: z.string().min(1).max(300),
    filename: z.string().min(1),
  }),
});

export const CreateProjectSchema = z.object({
  name: z.string().min(1).max(300),
  description: z.string().max(5000).optional(),
});

export const RenameProjectSchema = z.object({
  projectId: z.string().uuid(),
  name: z.string().trim().min(1).max(300),
});

export const SignedUploadUrlSchema = z.object({
  fileName: z.string().min(1).max(255),
});

export const RegisterUploadSchema = z.object({
  projectId: z.string().uuid(),
  fileName: z.string().min(1).max(255),
  storagePath: z.string().min(1),
});

// ─── panorama (Pannellum) ──────────────────────────────────────────────────
// Hotspot comments are positioned on a sphere: pitch ∈ [-90, 90], yaw ∈ [-180, 180].

export const CreatePanoramaCommentSchema = z.object({
  imageId: z.string().uuid(),
  content: z.string().min(1).max(5000),
  userName: z.string().min(1).max(200),
  pitch: z.number().min(-90).max(90),
  yaw: z.number().min(-180).max(180),
});

export const UpdatePanoramaCommentPositionSchema = z.object({
  commentId: z.string().min(1),
  pitch: z.number().min(-90).max(90),
  yaw: z.number().min(-180).max(180),
});

export const CreatePanoramaReplySchema = z.object({
  parentCommentId: z.string().min(1),
  content: z.string().min(1).max(5000),
  userName: z.string().min(1).max(200),
});

export const RegisterPanoramaImageSchema = z.object({
  projectId: z.string().uuid(),
  fileName: z.string().min(1).max(255),
  storagePath: z.string().min(1),
});

// ─── virtual tours (Biganto-style, Pannellum multi-scene) ──────────────────
// Navigation hotspots sit on the sphere like panorama comments; each one
// links its scene to a target scene in the same tour.

export const RegisterTourSceneSchema = z.object({
  projectId: z.string().uuid(),
  fileName: z.string().min(1).max(255),
  storagePath: z.string().min(1),
});

export const RenameTourSceneSchema = z.object({
  sceneId: z.string().uuid(),
  name: z.string().trim().min(1).max(300),
});

export const UpdateTourSceneViewSchema = z.object({
  sceneId: z.string().uuid(),
  pitch: z.number().min(-90).max(90),
  yaw: z.number().min(-180).max(180),
  hfov: z.number().min(30).max(160),
});

export const CreateTourHotspotSchema = z.object({
  sceneId: z.string().uuid(),
  targetSceneId: z.string().uuid(),
  pitch: z.number().min(-90).max(90),
  yaw: z.number().min(-180).max(180),
  label: z.string().trim().max(200).optional(),
});

export const UpdateTourHotspotSchema = z.object({
  hotspotId: z.string().uuid(),
  targetSceneId: z.string().uuid().optional(),
  pitch: z.number().min(-90).max(90).optional(),
  yaw: z.number().min(-180).max(180).optional(),
  label: z.string().trim().max(200).nullable().optional(),
});

// ─── websites ──────────────────────────────────────────────────────────────
// A website project is a markup project with kind='website'; each capture is a
// markup_thread. URLs are validated again server-side by lib/website/url.ts,
// which also runs the SSRF guard — these schemas only check shape and size.

export const VIEWPORT_ENUM = z.enum(['desktop', 'tablet', 'mobile']);

export const CaptureSettingsSchema = z.object({
  fullPage: z.boolean().optional(),
  viewports: z.array(VIEWPORT_ENUM).min(1).max(3).optional(),
  hideSelectors: z.array(z.string().max(200)).max(50).optional(),
  waitMs: z.number().int().min(0).max(30000).optional(),
});

export const CreateWebsiteProjectSchema = z.object({
  url: z.string().min(1).max(2000),
  name: z.string().trim().max(300).optional(),
  settings: CaptureSettingsSchema.optional(),
});

export const AddWebsitePagesSchema = z.object({
  projectId: z.string().uuid(),
  // One paste of a sitemap should not be able to queue thousands of captures.
  urls: z.array(z.string().min(1).max(2000)).min(1).max(50),
  viewports: z.array(VIEWPORT_ENUM).min(1).max(3).optional(),
});

export const RecaptureThreadSchema = z.object({
  threadId: z.string().uuid(),
});

export const ALLOWED_UPLOAD_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/pdf',
] as const;

export const MAX_UPLOAD_SIZE_BYTES = 20 * 1024 * 1024; // 20MB
