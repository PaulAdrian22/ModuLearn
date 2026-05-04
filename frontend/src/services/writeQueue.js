// Offline write queue.
//
// When `navigator.onLine` is false, callers enqueue an action descriptor
// here instead of letting the network call fail. The queue persists in
// localStorage so it survives reload. When the browser comes back online,
// `flush()` replays each queued action against the live API.
//
// Scope: only the writes that matter for adaptive-learning continuity —
//   * progress.update           (lesson completion, completion_rate updates)
//   * progress.trackTime        (time-spent pings)
//   * bkt.batchUpdate           (skill mastery deltas)
// Auth, profile edits, etc. fail loudly when offline (acceptable — those
// aren't time-critical and require server confirmation anyway).

const STORAGE_KEY = 'modulearn_write_queue_v1';

function read() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function write(items) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    /* storage full / disabled — drop the queue, can't help further */
  }
}

export function isOnline() {
  return typeof navigator === 'undefined' ? true : navigator.onLine !== false;
}

// Enqueue a description of the deferred call. `type` selects the executor
// in the dispatch table inside flush().
export function enqueue(type, payload) {
  const queue = read();
  queue.push({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type,
    payload,
    queuedAt: Date.now(),
  });
  write(queue);
  return queue.length;
}

export function queueLength() {
  return read().length;
}

// Replay every queued action in order. Failures keep the action in the
// queue (it will be retried on the next flush). Network errors leave the
// remaining queue intact; non-network errors (e.g. 400 because the row is
// gone) drop the action so it doesn't poison the queue forever.
export async function flush(executors) {
  const queue = read();
  if (!queue.length) return { drained: 0, retained: 0 };

  const remaining = [];
  let drained = 0;

  for (const item of queue) {
    const exec = executors[item.type];
    if (!exec) {
      // Unknown action type — keep so a future SW with the executor can
      // process it.
      remaining.push(item);
      continue;
    }
    try {
      await exec(item.payload);
      drained += 1;
    } catch (err) {
      // Heuristic: if the error looks like a network failure, retain;
      // otherwise drop (the server rejected the request, retrying won't help).
      const msg = String(err?.message || '').toLowerCase();
      const isNetwork = msg.includes('failed to fetch') || msg.includes('networkerror') || msg.includes('network request failed');
      if (isNetwork) remaining.push(item);
      else console.warn('[writeQueue] dropping action that the server rejected', item.type, err?.message);
    }
  }

  write(remaining);
  return { drained, retained: remaining.length };
}

// Listen for online/offline transitions and call `cb` whenever the queue
// has just been flushed. Returns an unsubscribe.
export function onOnlineFlush(cb, executors) {
  if (typeof window === 'undefined') return () => {};
  const handler = async () => {
    if (!isOnline()) return;
    const result = await flush(executors);
    if (result.drained > 0) cb(result);
  };
  window.addEventListener('online', handler);
  return () => window.removeEventListener('online', handler);
}
