/* save.js - persist the decrypted db using the KeeWeb browser-cache model.
 *
 * A file:// page can't write back to the USB .kdbx, so saving does two things:
 *   1. writes the encrypted bytes to the IndexedDB browser cache (durable
 *      across reloads; see cache.js)
 *   2. exports a Blob download so the current state lands on disk
 *
 * The decrypted db stays live in memory for the session, so you never have to
 * re-open after a save. This matches KeeWeb's approach (app-model.js): local
 * files with no cloud storage are saved to the browser cache.
 *
 * Attaches to window.WP.save */
(function () {
  'use strict';

  const WP = window.WP;
  const { store, kdbx, cache } = WP;

  // Trigger a browser download of `buffer` as `filename`.
  function download(buffer, filename) {
    const blob = new Blob([buffer], { type: 'application/x-kdbx' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename || 'database.kdbx';
    a.style.display = 'none';
    document.body.append(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // Re-encrypt the in-memory db, persist it to the browser cache, and export a
  // download. Returns { method: 'cache' }.
  async function saveDb(db) {
    const buffer = await kdbx.save(db);
    const name = store.state.fileName || 'database.kdbx';
    try {
      await cache.save(name, buffer);
    } catch (e) {
      // Cache write failed (e.g. quota). The download below still exports, so
      // this is best-effort rather than fatal.
    }
    store.markDirty(false);
    download(buffer, name);
    return { method: 'cache' };
  }

  WP.save = { saveDb, download };
})();
