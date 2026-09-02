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

  // Re-encrypt the in-memory db, persist it to the browser cache, and write
  // directly back to the file handle or export a single download.
  async function saveDb(db) {
    const buffer = await kdbx.save(db);
    let name = store.state.fileName || 'database.kdbx';
    if (!name.toLowerCase().endsWith('.kdbx')) {
      name += '.kdbx';
    }

    try {
      await cache.save(name, buffer);
    } catch (e) {
      // Cache write best-effort
    }

    let savedNative = false;
    const handle = store.state.handle || store.state.fileHandle;

    if (handle && typeof handle.createWritable === 'function') {
      try {
        const writable = await handle.createWritable();
        await writable.write(buffer);
        await writable.close();
        savedNative = true;
      } catch (err) {
        console.warn('Direct file handle write failed:', err);
      }
    }

    if (!savedNative) {
      download(buffer, name);
    }

    store.markDirty(false);
    return { method: savedNative ? 'file' : 'download' };
  }

  WP.save = { saveDb, download };
})();
