/* store.js - minimal observable state. Attaches to window.WP.store */
(function () {
  'use strict';

  const WP = window.WP;

  function fresh() {
    return {
      locked: true,
      db: null,            // decrypted kdbxweb.Kdbx, or null while locked
      header: null,        // kdbxweb header (version, kdf, ...)
      fileName: null,      // name of the open file
      handle: null,        // reserved; openFile uses <input type=file>, so this
                       // is always null (see the KeeWeb cache-and-export model)
      selectedGroupId: null,
      expanded: {},        // { [uuid]: true }
      dirty: false,        // in-memory db differs from what's on disk
    };
  }

  const store = {
    state: fresh(),

    update(patch) { Object.assign(this.state, patch); },

    markDirty(dirty) { this.state.dirty = !!dirty; },

    lock() { this.state = fresh(); },

    isDefaultGroup(db, group) {
      return group === db.getDefaultGroup();
    },
  };

  WP.store = store;
})();
