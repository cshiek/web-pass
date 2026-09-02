/* kdbx.js - kdbxweb wrapper: file open, unlock, and traversal helpers.
 * Attaches to window.WP.kdbx */
(function () {
  'use strict';

  const WP = window.WP;
  const kdbxweb = window.kdbxweb;

  // KeePass standard field keys. Anything else in entry.fields is a custom field.
  const STANDARD_FIELDS = new Set(['T', 'U', 'P', 'W', 'N', 'A', 'S', 'Title', 'UserName', 'Password', 'URL', 'Notes']);

  function uuidStr(uuid) {
    return uuid ? uuid.toString() : null;
  }

  /* ---- File opening ---- */

  // Open a .kdbx via a native file picker. Resolves
  // { buffer: ArrayBuffer, name: string, handle: null }.
  //
  // Uses <input type=file> rather than the File System Access API so it works
  // everywhere, including browsers that don't expose FSA (Firefox, the VS Code
  // embedded browser, iOS Safari). `handle` is null, so save() writes to the
  // browser cache and exports via download instead of overwriting the source
  // file (the KeeWeb model — a file:// page can't write back to the USB .kdbx).
  // Open a .kdbx via native file picker with .kdbx extension filter.
  function openFile() {
    return new Promise(function (resolve, reject) {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.kdbx';
      input.multiple = false;
      input.style.display = 'none';

      let handled = false;

      function cleanup() {
        if (input.parentNode) {
          input.parentNode.removeChild(input);
        }
      }

      function onCancel() {
        if (handled) return;
        handled = true;
        cleanup();
        const err = new Error('File selection cancelled');
        err.name = 'AbortError';
        reject(err);
      }

      input.oncancel = onCancel;

      input.onchange = function () {
        if (handled) return;
        const file = input.files && input.files[0];
        if (!file) {
          onCancel();
          return;
        }
        handled = true;
        cleanup();

        const reader = new FileReader();
        reader.onload = function () {
          resolve({ buffer: reader.result, name: file.name, handle: null });
        };
        reader.onerror = function () {
          reject(reader.error || new Error('Could not read file'));
        };
        reader.readAsArrayBuffer(file);
      };

      document.body.append(input);
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

  // Create a brand new .kdbx database with a master password (and optional key file).
  async function createDatabase(password, name, keyFileBuffer) {
    if (!password) {
      throw new Error('Please enter a master password for your new database.');
    }
    const dbName = (name && name.trim()) ? name.trim() : 'WebPass Vault';
    let creds;
    if (keyFileBuffer) {
      const kf = kdbxweb.Credentials.fromFile(keyFileBuffer);
      const pass = kdbxweb.ProtectedValue.fromString(password);
      creds = new kdbxweb.Credentials(pass, kf);
    } else {
      const pass = kdbxweb.ProtectedValue.fromString(password);
      creds = new kdbxweb.Credentials(pass);
    }
    await creds.ready;
    const db = kdbxweb.Kdbx.create(creds, dbName);
    return db;
  }

  // Re-encrypt and return the .kdbx bytes.
  async function save(db) {
    return await db.save();
  }

  // KeePass standard field keys mapping between short key and kdbxweb standard field key.
  const FIELD_MAP = {
    'T': 'Title',
    'U': 'UserName',
    'P': 'Password',
    'W': 'URL',
    'N': 'Notes',
    'A': 'AutoType',
  };

  function defaultGroup(db) { return db.getDefaultGroup(); }

  function groupUuid(group) { return uuidStr(group && group.uuid); }
  function entryUuid(entry) { return uuidStr(entry && entry.uuid); }

  // true if field is stored as a kdbxweb.ProtectedValue.
  function isProtected(entry, key) {
    if (!entry || !entry.fields) return false;
    const mappedKey = FIELD_MAP[key] || key;
    const value = entry.fields.get(mappedKey) || entry.fields.get(key);
    return value instanceof kdbxweb.ProtectedValue;
  }

  // Read a standard field's text ('T','U','P','W','N' or full key). Handles string | ProtectedValue.
  function fieldText(entry, key) {
    if (!entry || !entry.fields) return '';
    const mappedKey = FIELD_MAP[key] || key;
    const value = entry.fields.get(mappedKey) || entry.fields.get(key) || entry.fields.get('!' + key);
    if (value == null) return '';
    return value instanceof kdbxweb.ProtectedValue ? value.getText() : value;
  }

  // Entry title (T / Title), falling back to a placeholder.
  function entryTitle(entry) {
    const t = fieldText(entry, 'T');
    return t || '(Untitled)';
  }

  // List of custom field names (standard keys excluded).
  function customFieldNames(entry) {
    if (!entry || !entry.fields) return [];
    const names = [];
    const seen = new Set();
    entry.fields.forEach(function (_, k) {
      if (STANDARD_FIELDS.has(k)) return;
      if (seen.has(k)) return;
      seen.add(k);
      names.push(k);
    });
    return names;
  }

  // Create a new entry in `group` (assigns a fresh UUID).
  function createEntry(db, group, opts) {
    const entry = db.createEntry(group);
    if (opts && typeof opts === 'object') {
      if (opts.title) setField(entry, 'T', opts.title);
      if (opts.username) setField(entry, 'U', opts.username);
      if (opts.password) setField(entry, 'P', opts.password, true);
      if (opts.url) setField(entry, 'W', opts.url);
      if (opts.notes) setField(entry, 'N', opts.notes);
    }
    return entry;
  }

  // Check if an entry or group is inside the Recycle Bin tree.
  function inRecycleBin(db, entryOrGroup) {
    if (!db || !entryOrGroup) return false;
    const recycleUuid = db.meta && db.meta.recycleBinUuid ? uuidStr(db.meta.recycleBinUuid) : null;
    if (!recycleUuid) return false;

    let g = entryOrGroup.parentGroup || (entryOrGroup.entries ? entryOrGroup : null);
    while (g) {
      if (uuidStr(g.uuid) === recycleUuid) return true;
      g = g.parentGroup;
    }
    return false;
  }

  // Restore an entry from the Recycle Bin to the default group (or root group).
  function restoreEntry(db, entry) {
    if (!db || !entry) return;
    const target = defaultGroup(db) || (db.groups && db.groups[0]) || db.rootGroup;
    db.move(entry, target);
  }

  // Permanently delete an entry from the database.
  function deletePermanently(db, entry) {
    if (!db || !entry) return;
    db.move(entry, null);
  }

  // Remove an entry from the database. Moves to Recycle Bin if enabled and not already in Recycle Bin; otherwise removes permanently.
  function removeEntry(db, entry) {
    if (!db || !entry) return;
    if (inRecycleBin(db, entry) || !db.meta || !db.meta.recycleBinEnabled) {
      deletePermanently(db, entry);
    } else {
      db.remove(entry);
    }
  }

  // Set a string field. Empty/undefined clears it. Pass isProtected=true to
  // store the value as a ProtectedValue (masked in the UI).
  function setField(entry, key, value, isProtected) {
    if (!entry || !entry.fields) return;
    const mappedKey = FIELD_MAP[key] || key;
    if (value == null || value === '') {
      entry.fields.delete(mappedKey);
      if (mappedKey !== key) entry.fields.delete(key);
      return;
    }
    const valObj = isProtected ? kdbxweb.ProtectedValue.fromString(value) : value;
    entry.fields.set(mappedKey, valObj);
    if (mappedKey !== key && entry.fields.has(key)) {
      entry.fields.delete(key);
    }
  }

  // Recursively collect every active entry in the database (excluding Recycle Bin entries).
  function allEntries(db) {
    const out = [];
    const recycleUuid = db && db.meta && db.meta.recycleBinUuid ? uuidStr(db.meta.recycleBinUuid) : null;

    function walk(g) {
      if (!g) return;
      if (recycleUuid && uuidStr(g.uuid) === recycleUuid) return; // Skip Recycle Bin group
      if (g.entries) { for (const e of g.entries) out.push(e); }
      if (g.groups) { for (const sub of g.groups) walk(sub); }
    }
    if (db && db.rootGroup) {
      walk(db.rootGroup);
    } else if (db && db.groups) {
      for (const top of db.groups) walk(top);
    }
    return out;
  }

  // Find an entry by its uuid string.
  function findEntryById(db, id) {
    let found = null;
    function walk(g) {
      if (found || !g) return;
      if (g.entries) {
        for (const e of g.entries) { if (entryUuid(e) === id) { found = e; return; } }
      }
      if (g.groups) {
        for (const sub of g.groups) walk(sub);
      }
    }
    if (db && db.rootGroup) {
      walk(db.rootGroup);
    } else if (db && db.groups) {
      for (const top of db.groups) walk(top);
    }
    return found;
  }

  // Recursively collect every entry inside a group and its subgroups (skipping Recycle Bin unless explicitly selected).
  function groupEntries(db, group) {
    const out = [];
    if (!group) return out;
    const recycleUuid = db && db.meta && db.meta.recycleBinUuid ? uuidStr(db.meta.recycleBinUuid) : null;
    const isSelectedGroupRecycleBin = recycleUuid && groupUuid(group) === recycleUuid;

    function walk(g) {
      if (!g) return;
      if (!isSelectedGroupRecycleBin && recycleUuid && uuidStr(g.uuid) === recycleUuid) return;
      if (g.entries) { for (const e of g.entries) out.push(e); }
      if (g.groups) { for (const sub of g.groups) walk(sub); }
    }
    walk(group);
    return out;
  }

  // Find a group by its uuid string.
  function findGroupById(db, id) {
    let found = null;
    function walk(g) {
      if (found || !g) return;
      if (groupUuid(g) === id) { found = g; return; }
      if (g.groups) {
        for (const sub of g.groups) walk(sub);
      }
    }
    if (db && db.rootGroup) {
      walk(db.rootGroup);
    } else if (db && db.groups) {
      for (const top of db.groups) walk(top);
    }
    return found;
  }

  // Create a new group inside parentGroup (or rootGroup if null).
  function createGroup(db, parentGroup, name) {
    if (!db || !name) return null;
    const parent = parentGroup || defaultGroup(db) || (db.groups && db.groups[0]) || db.rootGroup;
    if (parent && typeof db.createGroup === 'function') {
      return db.createGroup(parent, name);
    }
    const group = kdbxweb.KdbxGroup.create(name, parent);
    if (parent && parent.groups) { parent.groups.push(group); }
    return group;
  }

  function getOrCreateGroupByName(db, parentGroup, name) {
    if (!db || !name) return parentGroup;
    const parent = parentGroup || defaultGroup(db) || (db.groups && db.groups[0]);
    const cleanName = name.trim();
    if (!cleanName) return parent;

    if (parent && parent.groups) {
      for (const g of parent.groups) {
        if (g.name && g.name.toLowerCase() === cleanName.toLowerCase()) {
          return g;
        }
      }
    }
    return createGroup(db, parent, cleanName) || parent;
  }

  // Rename an existing group.
  function renameGroup(db, group, newName) {
    if (!group || !newName || !newName.trim()) {
      throw new Error('Group name cannot be empty.');
    }
    const recycleUuid = db && db.meta && db.meta.recycleBinUuid ? uuidStr(db.meta.recycleBinUuid) : null;
    if (recycleUuid && groupUuid(group) === recycleUuid) {
      throw new Error('Cannot rename the Recycle Bin.');
    }
    group.name = newName.trim();
    if (group.times) group.times.update();
  }

  // Delete a group, moving its entries into the Recycle Bin.
  function deleteGroup(db, group) {
    if (!db || !group) return;
    const gUuid = groupUuid(group);
    const recycleUuid = db.meta && db.meta.recycleBinUuid ? uuidStr(db.meta.recycleBinUuid) : null;

    if (recycleUuid && gUuid === recycleUuid) {
      throw new Error('Cannot delete the Recycle Bin.');
    }

    const root = defaultGroup(db) || (db.groups && db.groups[0]) || db.rootGroup;
    if (root && groupUuid(root) === gUuid) {
      throw new Error('Cannot delete the Top Level root group.');
    }

    // Move all contained entries (recursive) to Recycle Bin
    const entries = groupEntries(group, true);
    entries.forEach(function (entry) {
      removeEntry(db, entry);
    });

    // Remove group from parent's groups list
    const parent = group.parentGroup || root;
    if (parent && parent.groups) {
      const idx = parent.groups.indexOf(group);
      if (idx !== -1) {
        parent.groups.splice(idx, 1);
      } else {
        for (let i = 0; i < parent.groups.length; i++) {
          if (groupUuid(parent.groups[i]) === gUuid) {
            parent.groups.splice(i, 1);
            break;
          }
        }
      }
    }
  }

  // Move an entry into a target group.
  function moveEntry(db, entry, targetGroup) {
    if (!db || !entry || !targetGroup) return;
    db.move(entry, targetGroup);
  }

  // Flat list of all active groups (for group selector dropdowns).
  function getAllGroups(db) {
    const out = [];
    const recycleUuid = db && db.meta && db.meta.recycleBinUuid ? uuidStr(db.meta.recycleBinUuid) : null;
    const root = defaultGroup(db) || (db && db.groups && db.groups[0]) || (db && db.rootGroup);
    const rootUuid = root ? groupUuid(root) : null;

    function walk(g, prefix) {
      if (!g) return;
      const gUuid = groupUuid(g);
      if (recycleUuid && gUuid === recycleUuid) return; // Skip Recycle Bin

      const isRoot = gUuid === rootUuid;
      const name = isRoot ? 'Top Level' : (g.name || '(unnamed)');
      const label = isRoot ? '📁 Top Level' : (prefix ? prefix + ' / ' + name : name);

      out.push({ group: g, uuid: gUuid, label, isRoot });

      if (g.groups) {
        for (const sub of g.groups) {
          walk(sub, isRoot ? '' : label);
        }
      }
    }

    if (root) {
      walk(root, '');
    } else if (db && db.groups) {
      for (const top of db.groups) walk(top, '');
    }
    return out;
  }

  WP.kdbx = {
    openFile, unlock, save, createDatabase,
    createEntry, removeEntry, restoreEntry, deletePermanently, inRecycleBin, setField,
    createGroup, renameGroup, deleteGroup, getOrCreateGroupByName, moveEntry, getAllGroups,
    defaultGroup, groupUuid, entryUuid, uuidStr,
    isProtected, fieldText, entryTitle, customFieldNames,
    allEntries, groupEntries, findEntryById, findGroupById,
    STANDARD_FIELDS,
  };
})();
