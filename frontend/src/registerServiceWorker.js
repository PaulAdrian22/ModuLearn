// Register the ModuLearn service worker.
//
// We only register in production builds. Dev mode (npm start) skips
// registration so live-reload + HMR aren't fighting a cached app shell.

export function registerServiceWorker() {
  if (typeof window === 'undefined') return;
  if (!('serviceWorker' in navigator)) return;
  if (process.env.NODE_ENV !== 'production') return;

  // Wait for the load event so SW registration doesn't compete with the
  // initial page render.
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/service-worker.js', { scope: '/' })
      .then((registration) => {
        // eslint-disable-next-line no-console
        console.info('[ModuLearn] Service worker registered, scope:', registration.scope);

        // When a new SW takes control, prompt the page to reload so the
        // user gets the latest shell. (One-shot; the controllerchange
        // event only fires when activation completes.)
        let refreshing = false;
        navigator.serviceWorker.addEventListener('controllerchange', () => {
          if (refreshing) return;
          refreshing = true;
          window.location.reload();
        });
      })
      .catch((err) => {
        // eslint-disable-next-line no-console
        console.error('[ModuLearn] Service worker registration failed', err);
      });
  });
}
