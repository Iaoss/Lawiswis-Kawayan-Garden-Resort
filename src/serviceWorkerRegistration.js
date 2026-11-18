// Turns on the offline file cache (src/service-worker.js) on the live site.
// Not used while developing (npm start), so code changes show straight away.
export function register() {
  if (process.env.NODE_ENV !== 'production' || typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${process.env.PUBLIC_URL}/service-worker.js`).catch(error => {
      console.warn('Offline support could not be turned on:', error);
    });
  });
}
