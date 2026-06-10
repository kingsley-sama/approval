'use client';

import { useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { DbComment } from '@/app/actions/comments';

interface UseRealtimeCommentsOptions {
  threadIds: string[];
  onNewComment: (comment: DbComment) => void;
  /** Fired when another client edits, moves, or resolves a comment. */
  onUpdateComment?: (comment: DbComment) => void;
  /** Fired when another client deletes a comment. Only the row id is available. */
  onDeleteComment?: (commentId: string) => void;
}

export function useRealtimeComments({ threadIds, onNewComment, onUpdateComment, onDeleteComment }: UseRealtimeCommentsOptions) {
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting');
  const retryCount = useRef(0);
  // Keep stable refs to the callbacks so the effect doesn't re-run when handlers change
  const onNewCommentRef = useRef(onNewComment);
  onNewCommentRef.current = onNewComment;
  const onUpdateCommentRef = useRef(onUpdateComment);
  onUpdateCommentRef.current = onUpdateComment;
  const onDeleteCommentRef = useRef(onDeleteComment);
  onDeleteCommentRef.current = onDeleteComment;

  const threadIdsKey = threadIds.join(',');

  useEffect(() => {
    if (!threadIds.length) return;

    const client = createClient();
    const filter = `thread_id=in.(${threadIds.join(',')})`;

    const channel = client
      .channel('realtime:markup_comments')
      .on(
        'postgres_changes' as any,
        { event: 'INSERT', schema: 'public', table: 'markup_comments', filter },
        (payload: any) => {
          if (payload.new) {
            onNewCommentRef.current(payload.new as DbComment);
          }
        },
      )
      .on(
        'postgres_changes' as any,
        { event: 'UPDATE', schema: 'public', table: 'markup_comments', filter },
        (payload: any) => {
          if (payload.new) {
            onUpdateCommentRef.current?.(payload.new as DbComment);
          }
        },
      )
      .on(
        'postgres_changes' as any,
        // DELETE payloads only carry the old row's primary key, so thread_id
        // filters never match — subscribe unfiltered and let the handler ignore
        // ids it doesn't know about.
        { event: 'DELETE', schema: 'public', table: 'markup_comments' },
        (payload: any) => {
          const id = payload.old?.id;
          if (id) {
            onDeleteCommentRef.current?.(id as string);
          }
        },
      )
      .subscribe((status: string) => {
        if (status === 'SUBSCRIBED') {
          setConnectionStatus('connected');
          retryCount.current = 0;
        }
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          if (retryCount.current < 3) {
            retryCount.current++;
            setTimeout(() => channel.subscribe(), 2000 * retryCount.current);
          } else {
            setConnectionStatus('disconnected');
          }
        }
        if (status === 'CLOSED') {
          setConnectionStatus('disconnected');
        }
      });

    return () => {
      client.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadIdsKey]);

  return { connectionStatus };
}
