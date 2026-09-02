/* cache.js - IndexedDB store for encrypted .kdbx bytes, keyed by filename.
 *
 * Implements the KeeWeb "browser cache" model: a file:// page can't write back
 * to the USB .kdbx, so saves are written here (durable across reloads) and
 * exported via download. The decrypted db also stays live in memory for the
 * session, so you never have to re-open after a save.
 *
 * Attaches to window.WP.cache */
(function () {
  'use strict';

  const WP = window.WP;
  const DB_NAME = 'webpass-cache';
  const STORE = 'files';

  // Single shared connection, resolved once the open request succeeds.
  let dbPromise = null;

  function connect() {
    if (!dbPromise) {
      dbPromise = new Promise(function (resolve, reject) {
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = function () {
          const db = req.result;
          if (!db.objectStoreNames.contains(STORE)) {
            db.createObjectStore(STORE, { keyPath: 'name' });
          }
        };
        req.onsuccess = function () { resolve(req.result); };
        req.onerror = function () { reject(req.error); };
      });
    }
    return dbPromise;
  }

  function tx(db, mode) {
    return db.transaction(STORE, mode);
  }

  function storeReq(req) {
    return new Promise(function (resolve, reject) {
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
  }

  // Store the encrypted bytes of a .kdbx under `name`.
  function save(name, buffer) {
    return connect().then(function (db) {
      return storeReq(tx(db, 'readwrite').store.put({ name: name, data: buffer }));
    });
  }

  // Retrieve { name, buffer } for `name`, or null if not cached.
  function get(name) {
    return connect().then(function (db) {
      return storeReq(tx(db, 'readonly').store.get(name));
    });
  }

  // List every cached entry as [{ name, buffer }].
  function all() {
    return connect().then(function (db) {
      return storeReq(tx(db, 'readonly').store.getAll()).then(function (items) {
        return (items || []).filter(function (i) { return i && i.data; })
          .map(function (i) { return { name: i.name, buffer: i.data }; });
      });
    });
  }

  // Remove a cached entry.
  function remove(name) {
    return connect().then(function (db) {
      return storeReq(tx(db, 'readwrite').store.delete(name));
    });
  }

  WP.cache = { save, get, all, remove };
})();
