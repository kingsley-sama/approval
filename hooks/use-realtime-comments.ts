'use client';

import { useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { DbComment } from '@/app/actions/comments';

interface UseRealtimeCommentsOptions {
  threadIds: string[];
  onNewComment: (comment: DbComment) => void;
}

export function useRealtimeComments({ threadIds, onNewComment }: UseRealtimeCommentsOptions) {
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting');
  const retryCount = useRef(0);
  // Keep a stable ref to the callback so the effect doesn't re-run when the handler changes
  const onNewCommentRef = useRef(onNewComment);
  onNewCommentRef.current = onNewComment;

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
