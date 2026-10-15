/**
 * Edit/delete rules for comments written by customers.
 *
 * A customer's comment is their request in their own words — editing or
 * deleting it rewrites the record of what was asked for. Migration 024 records
 * the author's role on every comment and enforces the rule with database
 * triggers; this module holds the shared client/server view of it, mirroring
 * lib/attachment-permissions.ts.
 *
 * Lives outside app/actions/ on purpose: that directory is 'use server', where
 * every export must be an async function.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export type CommentAuthorRole = 'team' | 'customer';

export const CUSTOMER_COMMENT_EDIT_ERROR =
  'This comment was written by the customer and cannot be edited.';
export const CUSTOMER_COMMENT_DELETE_ERROR =
  'This comment was written by the customer and cannot be deleted.';

/** Rows written before migration 024 have no `author_role`; treat as team. */
export function isCustomerComment(
  comment: { author_role?: string | null; authorRole?: string | null } | null | undefined,
): boolean {
  return (comment?.author_role ?? comment?.authorRole) === 'customer';
}

/**
 * Tag a freshly-inserted row as customer-written. Done as a follow-up update
 * rather than in the insert so commenting keeps working even if the migration
 * has not been applied yet (the column would be missing). Best-effort.
 */
export async function markCustomerAuthored(
  supabase: SupabaseClient<any, any, any>,
  table: 'markup_comments' | 'panorama_comments',
  id: string,
): Promise<void> {
  const { error } = await supabase.from(table).update({ author_role: 'customer' } as any).eq('id', id);
  if (error) console.warn(`[comments] could not tag ${table}.${id} as customer-authored:`, error.message);
}

/** Whether the row with this id is a customer comment (false if the column is missing). */
export async function fetchIsCustomerComment(
  supabase: SupabaseClient<any, any, any>,
  table: 'markup_comments' | 'panorama_comments',
  id: string,
): Promise<boolean> {
  const { data, error } = await supabase.from(table).select('*').eq('id', id).maybeSingle();
  if (error || !data) return false;
  return isCustomerComment(data as { author_role?: string | null });
}
