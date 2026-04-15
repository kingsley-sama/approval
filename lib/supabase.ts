import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Database } from '@/types/supabase';

// Create Supabase clients for different contexts
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl) {
  throw new Error('Missing environment variable: NEXT_PUBLIC_SUPABASE_URL');
}

if (!supabaseAnonKey) {
  throw new Error('Missing environment variable: NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY');
}

// Regular client for client-side operations (uses anon key)
export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey);

// Admin client for server-side operations (has bypass RLS permissions)
// Will throw error if SUPABASE_SERVICE_ROLE_KEY is not set (server-side only)
export const supabaseAdmin = (() => {
  if (typeof window === 'undefined' && !supabaseServiceKey) {
    // Only throw error on server-side if key is missing
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY is required for server-side admin operations. ' +
      'Add it to your .env file.'
    );
  }
  // On client-side or if key exists on server, create the client
  return createClient<Database>(
    supabaseUrl, 
    supabaseServiceKey || supabaseAnonKey, // Fallback to anon key on client
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
})();

export interface UploadResult {
  bucket: string;
  path: string;
  id: string;
  publicUrl: string;
}

export interface MultiUploadResult {
  successfulUploads: UploadResult[];
  failedUploads: { fileName: string; error: any }[];
}

/**
 * Unified Storage Service for handling all file operations with Supabase Storage
 * Supports both client-side (File objects) and server-side (Buffer) uploads
 */
export class StorageService {
  private client: SupabaseClient<Database>;
  private bucketName: string;

  constructor(useAdmin = false) {
    // Use admin client for server-side operations, regular client for client-side
    this.client = useAdmin ? supabaseAdmin : supabase;
    this.bucketName = process.env.NEXT_PUBLIC_SUPABASE_BUCKET_NAME || 'screenshots';
  }

  /**
   * Upload a file from client (File object)
   */
  async uploadFile(
    file: File,
    projectName: string,
    options?: { upsert?: boolean; cacheControl?: string }
  ): Promise<UploadResult> {
    const filePath = `${projectName}/${file.name}`;
    
    const { data, error } = await this.client.storage
      .from(this.bucketName)
      .upload(filePath, file, {
        cacheControl: options?.cacheControl || '31536000',
        upsert: options?.upsert ?? true,
      });

    if (error) throw error;

    const publicUrl = this.getFileUrl(data.path);

    return {
      bucket: this.bucketName,
      path: data.path,
      id: data.id,
      publicUrl,
    };
  }

  /**
   * Upload a file from server (Buffer)
   */
  async uploadBuffer(
    buffer: Buffer,
    fileName: string,
    projectName: string,
    contentType: string,
    options?: { upsert?: boolean }
  ): Promise<UploadResult> {
    const filePath = `${projectName}/${fileName}`;

    const { data, error } = await this.client.storage
      .from(this.bucketName)
      .upload(filePath, buffer, {
        contentType,
        cacheControl: '31536000',
        upsert: options?.upsert ?? true,
      });

    if (error) throw error;

    const publicUrl = this.getFileUrl(data.path);

    return {
      bucket: this.bucketName,
      path: data.path,
      id: data.id,
      publicUrl,
    };
  }

  /**
   * Upload multiple files at once
   */
  async uploadMultipleFiles(
    files: File[],
    projectName: string,
    options?: { upsert?: boolean; cacheControl?: string }
  ): Promise<MultiUploadResult> {
    const uploadPromises = files.map((file) =>
      this.uploadFile(file, projectName, options)
        .then((result) => ({ status: 'fulfilled' as const, value: result }))
        .catch((error) => ({ status: 'rejected' as const, fileName: file.name, reason: error }))
    );

    const results = await Promise.all(uploadPromises);

    const successfulUploads = results
      .filter((r): r is { status: 'fulfilled'; value: UploadResult } => r.status === 'fulfilled')
      .map((r) => r.value);

    const failedUploads = results
      .filter((r): r is { status: 'rejected'; fileName: string; reason: any } => r.status === 'rejected')
      .map((r) => ({ fileName: r.fileName, error: r.reason }));

    return { successfulUploads, failedUploads };
  }

  /**
   * Get a public URL for a file
   */
  getFileUrl(filePath: string): string {
    const { data } = this.client.storage.from(this.bucketName).getPublicUrl(filePath);
    return data.publicUrl;
  }

  /**
   * Create a signed URL for private files
   */
  async createSignedUrl(path: string, expiresIn = 600): Promise<string> {
    const { data, error } = await this.client.storage
      .from(this.bucketName)
      .createSignedUrl(path, expiresIn);

    if (error) throw error;
    return data.signedUrl;
  }

  /**
   * Delete a file
   */
  async deleteFile(filePath: string): Promise<void> {
    const { error } = await this.client.storage
      .from(this.bucketName)
      .remove([filePath]);

    if (error) throw error;
  }

  /**
   * Delete multiple files at once
   */
  async deleteMultipleFiles(filePaths: string[]): Promise<void> {
    const { error } = await this.client.storage
      .from(this.bucketName)
      .remove(filePaths);

    if (error) throw error;
  }

  /**
   * List files in a folder
   */
  async listFiles(folderPath: string = '') {
    const { data, error } = await this.client.storage
      .from(this.bucketName)
      .list(folderPath);

    if (error) throw error;
    return data;
  }

  /**
   * Check if a file exists
   */
  async fileExists(filePath: string): Promise<boolean> {
    try {
      const { data, error } = await this.client.storage
        .from(this.bucketName)
        .list(filePath.split('/').slice(0, -1).join('/'));

      if (error) return false;
      
      const fileName = filePath.split('/').pop();
      return data.some(file => file.name === fileName);
    } catch {
      return false;
    }
  }

  /**
   * Move/rename a file
   */
  async moveFile(fromPath: string, toPath: string): Promise<void> {
    const { error } = await this.client.storage
      .from(this.bucketName)
      .move(fromPath, toPath);

    if (error) throw error;
  }

  /**
   * Copy a file
   */
  async copyFile(fromPath: string, toPath: string): Promise<void> {
    const { error } = await this.client.storage
      .from(this.bucketName)
      .copy(fromPath, toPath);

    if (error) throw error;
  }
}

// Export singleton instances for convenience
export const storageService = new StorageService(false); // Client instance (uses anon key)
export const storageServiceAdmin = new StorageService(true); // Admin instance (uses service role key - server-side only)
