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
      handle: null,        // FileSystemFileHandle (enables atomic save) or null
      selectedGroupId: null,
      expanded: {},        // { [uuid]: true }
    };
  }

  const store = {
    state: fresh(),

    update(patch) { Object.assign(this.state, patch); },

    lock() { this.state = fresh(); },

    isDefaultGroup(db, group) {
      return group === db.getDefaultGroup();
    },
  };

  WP.store = store;
})();
