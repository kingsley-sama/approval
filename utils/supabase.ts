/**
 * @deprecated This file is deprecated. Please use '@/lib/supabase' instead.
 * This file is kept for backward compatibility but will be removed in a future version.
 * 
 * Migration guide:
 * - Replace: `import SupabaseService from '@/utils/supabase'`
 * - With: `import { StorageService } from '@/lib/supabase'`
 * - Replace: `new SupabaseService()`
 * - With: `new StorageService()`
 * 
 * The new StorageService includes the following improvements:
 * - Direct publicUrl in UploadResult (no need to call getFileUrl separately)
 * - Support for both client and server-side operations
 * - Additional methods: deleteMultipleFiles, listFiles, fileExists, moveFile, copyFile
 * - Better TypeScript types with Database integration
 * - Unified client/admin instance management
 */

import { StorageService, UploadResult, MultiUploadResult } from '@/lib/supabase';

// Re-export the new StorageService as default for backward compatibility
export default StorageService;

// Re-export types
export type { UploadResult, MultiUploadResult };
