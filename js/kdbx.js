/* kdbx.js - kdbxweb wrapper: file open, unlock, and traversal helpers.
 * Attaches to window.WP.kdbx */
(function () {
  'use strict';

  const WP = window.WP;
  const kdbxweb = window.kdbxweb;

  // KeePass standard field keys. Anything else in entry.fields is a custom field.
  const STANDARD_FIELDS = new Set(['T', 'U', 'P', 'W', 'N', 'A', 'S']);

  function uuidStr(uuid) {
    return uuid ? uuid.toString() : null;
  }

  /* ---- File opening ---- */

  // Open a .kdbx via the File System Access API, falling back to <input type=file>.
  // Resolves { buffer: ArrayBuffer, name: string, handle: FileSystemFileHandle|null }.
  async function openFile() {
    if (typeof window.showOpenFilePicker === 'function') {
      const handles = await window.showOpenFilePicker({
        multiple: false,
        types: [{
          description: 'KeePass Database',
          accept: { 'application/x-kdbx': ['.kdbx'] },
        }],
      });
      const handle = handles[0];
      const file = await handle.getFile();
      return { buffer: await file.arrayBuffer(), name: file.name, handle: handle };
    }
    return await openFileFallback();
  }

  function openFileFallback() {
    return new Promise(function (resolve, reject) {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.kdbx,application/x-kdbx';
      input.onchange = function () {
        const file = input.files && input.files[0];
        if (!file) { reject(new Error('No file selected')); return; }
        const reader = new FileReader();
        reader.onload = function () { resolve({ buffer: reader.result, name: file.name, handle: null }); };
        reader.onerror = function () { reject(reader.error || new Error('Could not read file')); };
        reader.readAsArrayBuffer(file);
      };
      input.click();
    });
  }

  /* ---- Unlock ---- */

  // Load and decrypt a .kdbx. Throws Error with `.wrongPassword` set on failure.
  async function unlock(buffer, password, keyFileBuffer) {
    if (!password) {
      const err = new Error('Enter the master password.');
      err.wrongPassword = false;
      throw err;
    }
    const credentials = keyFileBuffer
      ? new kdbxweb.KdbxCredentials(kdbxweb.ProtectedValue.fromString(password), keyFileBuffer)
      : new kdbxweb.KdbxCredentials(kdbxweb.ProtectedValue.fromString(password));

    let db;
    try {
      db = await kdbxweb.Kdbx.load(buffer, credentials);
    } catch (e) {
      // kdbxweb reports credential/key failures as BadSignature or InvalidKey
      // (InvalidKey on KDBX4), and damaged files as FileCorrupt.
      const code = e && e.code;
      const wrong = code === kdbxweb.Consts.ErrorCodes.BadSignature
        || code === kdbxweb.Consts.ErrorCodes.InvalidKey;
      const err = new Error(wrong
        ? 'Could not unlock — wrong master password.'
        : 'Could not open this file (unsupported, corrupt, or truncated).');
      err.wrongPassword = !!wrong;
      throw err;
    }
    return db;
  }

  // Re-encrypt and return the .kdbx bytes.
  async function save(db) {
    return await db.save();
  }

  /* ---- Traversal / field helpers ---- */

  function defaultGroup(db) { return db.getDefaultGroup(); }

  function groupUuid(group) { return uuidStr(group && group.uuid); }
  function entryUuid(entry) { return uuidStr(entry && entry.uuid); }

  // true if `key` (e.g. 'P') is stored as a protected field ('!P').
  function isProtected(entry, key) {
    return entry && entry.fields && entry.fields.has('!' + key);
  }

  // Read a standard field's text ('T','U','P','W','N'). Handles string | ProtectedValue.
  function fieldText(entry, key) {
    if (!entry || !entry.fields) return '';
    const value = entry.fields.get('!' + key) || entry.fields.get(key);
    if (value == null) return '';
    return value instanceof kdbxweb.ProtectedValue ? value.getText() : value;
  }

  // Entry title (T), falling back to a placeholder.
  function entryTitle(entry) {
    const t = fieldText(entry, 'T');
    return t || '(Untitled)';
  }

  // List of custom field names (standard keys excluded).
  // Note: kdbxweb's StringMap yields the *display* name (Title, UserName, ...)
  // for standard fields rather than the raw key (T, U, ...), so exclude both.
  function customFieldNames(entry) {
    if (!entry || !entry.fields) return [];
    const DISPLAY_NAMES = new Set(['Title', 'UserName', 'Password', 'URL', 'Notes']);
    const names = [];
    const seen = new Set();
    entry.fields.forEach(function (_, k) {
      if (STANDARD_FIELDS.has(k)) return;
      if (DISPLAY_NAMES.has(k)) return;
      if (seen.has(k)) return;
      seen.add(k);
      names.push(k);
    });
    return names;
  }

  // Create a new entry in `group` (assigns a fresh UUID).
  function createEntry(db, group, opts) {
    return db.createEntry(group, Object.assign({ uuid: true }, opts));
  }

  // Remove an entry from the database.
  function removeEntry(db, entry) {
    db.remove(entry);
  }

  // Set a string field. Empty/undefined clears it. Pass isProtected=true to
  // store the value as a ProtectedValue (masked in the UI).
  function setField(entry, key, value, isProtected) {
    if (value == null || value === '') { entry.fields.delete(key); return; }
    entry.fields.set(key, isProtected ? kdbxweb.ProtectedValue.fromString(value) : value);
  }

  // Recursively collect every entry in the database.
  function allEntries(db) {
    const out = [];
    function walk(g) {
      for (const e of g.entries) out.push(e);
      for (const sub of g.groups) walk(sub);
    }
    walk(defaultGroup(db));
    return out;
  }

  // Find an entry by its uuid string.
  function findEntryById(db, id) {
    let found = null;
    function walk(g) {
      if (found) return;
      for (const e of g.entries) { if (entryUuid(e) === id) { found = e; return; } }
      for (const sub of g.groups) walk(sub);
    }
    walk(defaultGroup(db));
    return found;
  }

  WP.kdbx = {
    openFile, openFileFallback, unlock, save,
    createEntry, removeEntry, setField,
    defaultGroup, groupUuid, entryUuid,
    isProtected, fieldText, entryTitle, customFieldNames,
    allEntries, findEntryById,
    STANDARD_FIELDS,
  };
})();
