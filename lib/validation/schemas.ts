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

export const SignedUploadUrlSchema = z.object({
  fileName: z.string().min(1).max(255),
});

export const RegisterUploadSchema = z.object({
  projectId: z.string().uuid(),
  fileName: z.string().min(1).max(255),
  storagePath: z.string().min(1),
});

export const ALLOWED_UPLOAD_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/pdf',
] as const;

export const MAX_UPLOAD_SIZE_BYTES = 20 * 1024 * 1024; // 20MB
