/* app.js - bootstrap: register routes and start the router.
 * Loaded last so all modules are defined. */
(function () {
  'use strict';

  const WP = window.WP;
  const { router, vault, unlock } = WP;

  function fileName() { return WP.store.state.fileName || ''; }

  router.add('/', function () { return unlock.render(); });
  router.add('/vault', function () { return vault.render(); });
  router.add('/vault/:id', function (params) { return vault.entryEditor(params.id); });
  router.add('/settings', function () {
    const ui = WP.ui;
    const lockBtn = ui.el('button', { class: 'btn btn-ghost', id: 'lock-btn' }, '🔒 Lock');
    lockBtn.onclick = function () { WP.store.lock(); location.hash = '#/'; };
    return ui.el('div', { class: 'vault' }, [
      ui.el('header', { class: 'vault-header' }, [
        ui.el('span', { class: 'brand' }, 'WebPass'),
        ui.el('span', { class: 'file-name' }, fileName()),
        ui.el('span', {}, ''),
        lockBtn,
      ]),
      ui.el('div', { class: 'detail-body' },
        ui.el('div', { class: 'empty' }, 'Settings — coming in a later milestone.')),
    ]);
  });

  // Wire one-time session lifecycle events (auto-lock on tab hidden,
  // unsaved-changes guard, page-close cleanup).
  WP.session.init();

  router.start();
})();
