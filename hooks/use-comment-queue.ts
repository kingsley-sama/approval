'use client';

import { useState, useCallback, useRef } from 'react';
import { createComment, DbComment } from '@/app/actions/comments';

const QUEUE_KEY = 'annot8_comment_queue';
const MAX_RETRIES = 3;

export interface PendingComment {
  localId: string;
  threadId: string;
  content: string;
  userName: string;
  x: number;
  y: number;
  pinNumber: number;
  createdAt: string;
  retries: number;
  drawingData?: any; // optional shape JSON for drawing annotations
}

// ─── localStorage helpers ─────────────────────────────────────────────────────

function readQueue(): PendingComment[] {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
  } catch {
    return [];
  }
}

function writeQueue(q: PendingComment[]) {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(q));
  } catch {
    // Storage full or unavailable — silently skip persistence
  }
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useCommentQueue() {
  const [pendingCount, setPendingCount] = useState<number>(() => readQueue().length);
  const [isSyncing, setIsSyncing] = useState(false);
  const syncingRef = useRef(false); // prevent concurrent drain runs

  /** Add a comment to the queue and return it immediately for UI updates. */
  const enqueue = useCallback((
    threadId: string,
    content: string,
    userName: string,
    x: number,
    y: number,
    pinNumber: number,
    drawingData?: any,
  ): PendingComment => {
    const localId = `local_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const item: PendingComment = {
      localId,
      threadId,
      content,
      userName,
      x,
      y,
      pinNumber,
      createdAt: new Date().toISOString(),
      retries: 0,
      drawingData,
    };
    const q = readQueue();
    q.push(item);
    writeQueue(q);
    setPendingCount(q.length);
    return item;
  }, []);

  /**
   * Return pending comments for a specific thread.
   * Used when loading the page to merge local items not yet in the DB.
   */
  const getPendingForThread = useCallback((threadId: string): PendingComment[] => {
    return readQueue().filter(c => c.threadId === threadId);
  }, []);

  /**
   * Drain the queue in the background.
   * For each item: call createComment, then either:
   *   - call onSynced(localId, dbComment) and remove from queue, or
   *   - retry up to MAX_RETRIES, then call onFailed(localId) and drop it.
   */
  const drainQueue = useCallback(async (
    onSynced: (localId: string, comment: DbComment) => void,
    onFailed: (localId: string) => void,
  ) => {
    // If already draining, schedule a re-run after current drain finishes
    // instead of silently dropping the call
    if (syncingRef.current) {
      setTimeout(() => drainQueue(onSynced, onFailed), 500);
      return;
    }
    const q = readQueue();
    if (q.length === 0) return;

    syncingRef.current = true;
    setIsSyncing(true);

    const remaining: PendingComment[] = [];

    for (const item of q) {
      try {
        const result = await createComment(
          item.threadId,
          item.content,
          item.userName,
          item.x,
          item.y,
          item.drawingData,
        );
        if (result.success && result.comment) {
          onSynced(item.localId, result.comment);
        } else {
          const updated = { ...item, retries: item.retries + 1 };
          if (updated.retries < MAX_RETRIES) {
            remaining.push(updated);
          } else {
            onFailed(item.localId);
          }
        }
      } catch {
        const updated = { ...item, retries: item.retries + 1 };
        if (updated.retries < MAX_RETRIES) {
          remaining.push(updated);
        } else {
          onFailed(item.localId);
        }
      }
    }

    writeQueue(remaining);
    setPendingCount(remaining.length);
    syncingRef.current = false;
    setIsSyncing(false);
  }, []);

  return { enqueue, getPendingForThread, drainQueue, pendingCount, isSyncing };
}
