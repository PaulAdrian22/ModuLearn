import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { flush, isOnline as checkOnline, queueLength } from '../services/writeQueue';

// Executors used to replay queued actions on reconnect. Kept in this file
// so the writeQueue module stays free of supabase/Modal dependencies (it's
// pure data); the executors live where the deps live.
const buildExecutors = () => ({
  'progress.update': async ({ moduleId, patch }) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not signed in');
    const { error } = await supabase
      .from('progress')
      .update(patch)
      .eq('user_id', user.id)
      .eq('module_id', moduleId);
    if (error) throw error;
  },

  'progress.trackTime': async ({ moduleId, seconds }) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not signed in');
    const { error } = await supabase
      .from('lesson_time_logs')
      .insert({ user_id: user.id, module_id: moduleId, seconds });
    if (error) throw error;
  },

  'bkt.batchUpdate': async (payload) => {
    const url = process.env.REACT_APP_BKT_BATCH_UPDATE_URL;
    if (!url) throw new Error('REACT_APP_BKT_BATCH_UPDATE_URL not set');
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) throw new Error('Not signed in');
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`bkt.batchUpdate replay failed (${res.status})`);
  },
});

/**
 * OfflineBanner — shows online/offline status across the top of the app.
 *
 *   * Offline → red banner with queued-action count
 *   * Online with queued actions waiting → blue banner ("syncing N items")
 *   * Online and queue empty → nothing rendered
 *
 * Mount once near the root (App.js). Self-contained — listens for
 * online/offline events and replays the writeQueue on reconnect.
 */
const OfflineBanner = () => {
  const [online, setOnline] = useState(checkOnline());
  const [queued, setQueued] = useState(queueLength());
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    const goOnline = async () => {
      setOnline(true);
      const initial = queueLength();
      if (initial === 0) return;
      setSyncing(true);
      try {
        const { drained, retained } = await flush(buildExecutors());
        setQueued(retained);
        if (drained > 0) {
          // eslint-disable-next-line no-console
          console.info(`[OfflineBanner] replayed ${drained} queued action(s); ${retained} pending`);
        }
      } finally {
        setSyncing(false);
      }
    };
    const goOffline = () => {
      setOnline(false);
      setQueued(queueLength());
    };

    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);

    // Refresh queue count periodically while offline so new items show up.
    const interval = setInterval(() => {
      if (!checkOnline()) setQueued(queueLength());
    }, 2000);

    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
      clearInterval(interval);
    };
  }, []);

  if (online && !syncing) return null;

  if (!online) {
    return (
      <div className="fixed top-0 left-0 right-0 z-50 bg-red-600 text-white text-sm px-4 py-2 text-center font-medium shadow">
        You&rsquo;re offline. Lessons you&rsquo;ve already opened are still readable.
        {queued > 0 && ` ${queued} change${queued === 1 ? '' : 's'} will sync when you reconnect.`}
      </div>
    );
  }

  return (
    <div className="fixed top-0 left-0 right-0 z-50 bg-blue-600 text-white text-sm px-4 py-2 text-center font-medium shadow">
      Syncing {queued} change{queued === 1 ? '' : 's'}&hellip;
    </div>
  );
};

export default OfflineBanner;
