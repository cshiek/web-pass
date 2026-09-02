/* save.js - persist the decrypted db back to disk.
 *
 * Strategy (see design.md §3.3):
 *   - Primary: File System Access API. Write to a temp file in the same
 *     directory, then overwrite the target, so an interrupted write can't
 *     corrupt the user's .kdbx (a temp copy always survives).
 *   - Fallback: Blob + <a download> for browsers without FSA (Safari, older
 *     Android). There's no handle to write to, so the user re-opens the
 *     downloaded file to keep working.
 *
 * Attaches to window.WP.save */
(function () {
  'use strict';

  const WP = window.WP;
  const { store, kdbx } = WP;

  function hasFSA() {
    return typeof window.showSaveFilePicker === 'function';
  }

  // Write `buffer` to `handle` atomically: temp file first, then overwrite.
  async function atomicSave(handle, buffer) {
    const dirHandle = await handle.getParent();
    const tempName = '.webpass-tmp-' + Date.now() + '.kdbx';
    const tempHandle = await dirHandle.createChildFile(tempName);

    const tempWritable = await tempHandle.createWritable();
    await tempWritable.write(buffer);
    await tempWritable.close();

    try {
      const target = await handle.createWritable();
      await target.write(buffer);
      await target.close();
    } catch (e) {
      // Best-effort cleanup; the temp copy still holds the latest bytes.
      try { await dirHandle.removeChildHandle(tempName); } catch (err) { /* ignore */ }
      throw e;
    }

    try { await dirHandle.removeChildHandle(tempName); } catch (err) { /* ignore */ }
  }

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

  // Re-encrypt the in-memory db and persist it.
  // Returns { method: 'fsa' | 'download' }. Falls back to download if the FSA
  // write fails (e.g. read-only directory) or there's no handle.
  async function saveDb(db) {
    const buffer = await kdbx.save(db);
    const handle = store.state.handle;

    if (hasFSA() && handle) {
      try {
        await atomicSave(handle, buffer);
        store.markDirty(false);
        return { method: 'fsa' };
      } catch (e) {
        // fall through to download
      }
    }

    download(buffer, store.state.fileName || 'database.kdbx');
    return { method: 'download' };
  }

  WP.save = { saveDb, atomicSave, download, hasFSA };
})();
