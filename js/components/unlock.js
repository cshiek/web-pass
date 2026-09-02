/* unlock.js - unlock screen component. Attaches to window.WP.unlock */
(function () {
  'use strict';

  const WP = window.WP;
  const { ui, store, kdbx, cache } = WP;

  // Returns a DOM node for the unlock screen.
  function render() {
    const state = { file: null, keyFile: null };

    const status = ui.el('div', { class: 'status info', role: 'status' });
    const card = ui.el('div', {});

    function setStatusError(msg) {
      status.className = 'status error';
      status.textContent = msg;
    }

    function renderStep1() {
      ui.clear(card);
      status.className = 'status info';
      status.textContent = '';

      card.append(
        ui.el('h1', {}, 'WebPass'),
        ui.el('p', { class: 'tagline' }, 'Portable KeePass password manager'),
        status,
      );

      // ---- Step 1: Open existing .kdbx OR Create new database ----
      const openBtn = ui.el('button', { class: 'btn btn-primary', style: 'width: 100%; margin-bottom: 8px;' }, '📂 Open existing .kdbx file');
      openBtn.onclick = async function () {
        status.className = 'status info';
        status.textContent = '';
        try {
          const opened = await kdbx.openFile();
          state.file = opened;
          renderStep2(state.file);
        } catch (e) {
          if (e && e.name === 'AbortError') {
            status.className = 'status info';
            status.textContent = 'Cancelled.';
          } else {
            status.className = 'status error';
            status.textContent = 'Could not open file: ' + (e && e.message ? e.message : e);
          }
        }
      };

      const createNewBtn = ui.el('button', { class: 'btn btn-ghost', style: 'width: 100%; border: 1px solid var(--border);' }, '✨ Create new .kdbx database');
      createNewBtn.onclick = function () { renderCreateVault(); };

      const btnContainer = ui.el('div', { class: 'actions', style: 'display: flex; flex-direction: column; gap: 8px; margin-top: 16px;' }, [
        openBtn,
        createNewBtn,
      ]);
      card.append(btnContainer);

      // ---- Recently saved (browser cache) ----
      const recent = ui.el('div', { class: 'recent', style: 'margin-top: 20px;' });
      card.append(recent);
      renderRecent(recent);
    }

    function renderRecent(recentEl) {
      cache.all().then(function (files) {
        ui.clear(recentEl);
        if (!files || files.length === 0) { return; }
        recentEl.append(ui.el('h3', {}, 'Recently saved'));
        files.forEach(function (f) {
          const row = ui.el('div', { class: 'file-meta' });
          row.append(ui.el('span', {}, f.name));
          const restoreBtn = ui.el('button', { class: 'btn btn-ghost' }, 'Restore');
          restoreBtn.onclick = function () { restoreFlow(f); };
          row.append(restoreBtn);
          recentEl.append(row);
        });
      }).catch(function () { /* cache unavailable — ignore */ });
    }

    function restoreFlow(cached) {
      status.className = 'status info';
      status.textContent = '';
      cache.get(cached.name).then(function (entry) {
        if (!entry || !entry.data) {
          setStatusError('Cached copy of ' + cached.name + ' is missing.');
          return;
        }
        state.file = { name: entry.name, buffer: entry.data, handle: null };
        renderStep2(state.file);
      }).catch(function () {
        setStatusError('Could not read cached copy of ' + cached.name + '.');
      });
    }

    // ---- Create New Vault flow ----
    function renderCreateVault() {
      ui.clear(card);
      status.className = 'status info';
      status.textContent = '';

      card.append(
        ui.el('h1', {}, 'WebPass'),
        ui.el('p', { class: 'tagline' }, 'Create a new encrypted KeePass vault'),
        status,
      );

      const nameInput = ui.el('input', {
        type: 'text',
        id: 'vault-name',
        value: 'Passwords.kdbx',
        placeholder: 'Passwords.kdbx',
        autocomplete: 'off',
      });

      const passInput = ui.el('input', {
        type: 'password',
        id: 'new-pass',
        placeholder: 'Master password',
        autocomplete: 'off',
      });

      const confirmInput = ui.el('input', {
        type: 'password',
        id: 'confirm-pass',
        placeholder: 'Confirm master password',
        autocomplete: 'off',
      });

      card.append(
        ui.el('div', { class: 'field' }, [
          ui.el('label', { for: 'vault-name' }, 'Vault Filename'),
          nameInput,
        ]),
        ui.el('div', { class: 'field' }, [
          ui.el('label', { for: 'new-pass' }, 'Master Password'),
          passInput,
        ]),
        ui.el('div', { class: 'field' }, [
          ui.el('label', { for: 'confirm-pass' }, 'Confirm Master Password'),
          confirmInput,
        ]),
      );

      const backBtn = ui.el('button', { class: 'btn btn-ghost' }, '← Back');
      backBtn.onclick = function () { renderStep1(); };

      const createBtn = ui.el('button', { class: 'btn btn-primary' }, 'Create & Open Vault');

      card.append(
        ui.el('div', { style: 'display: flex; justify-content: space-between; margin-top: 20px;' }, [
          backBtn,
          createBtn,
        ])
      );

      async function submitCreate() {
        let name = nameInput.value.trim();
        if (!name) name = 'Passwords.kdbx';
        if (!name.toLowerCase().endsWith('.kdbx')) name += '.kdbx';

        const pass = passInput.value;
        const confirm = confirmInput.value;

        if (!pass) {
          setStatusError('Please enter a master password.');
          passInput.focus();
          return;
        }
        if (pass !== confirm) {
          setStatusError('Passwords do not match. Please re-enter.');
          confirmInput.focus();
          return;
        }

        createBtn.disabled = true;
        createBtn.textContent = 'Creating Vault…';
        status.className = 'status info';
        status.textContent = 'Generating database & master keys…';

        try {
          const dbName = name.replace(/\.kdbx$/i, '');
          const db = await kdbx.createDatabase(pass, dbName);
          const buffer = await kdbx.save(db);

          try { await cache.save(name, buffer); } catch (e) { /* ignore cache error */ }

          WP.save.download(buffer, name);

          const defaultId = kdbx.groupUuid(kdbx.defaultGroup(db));
          store.update({
            locked: false,
            db: db,
            header: db.header,
            fileName: name,
            handle: null,
            selectedGroupId: null,
            expanded: { [defaultId]: true },
          });
          if (WP.ui && WP.ui.toast) WP.ui.toast('New vault "' + name + '" created!');
          location.hash = '#/vault';
        } catch (err) {
          console.error('Create database error:', err);
          setStatusError('Failed to create database: ' + (err.message || String(err)));
          createBtn.disabled = false;
          createBtn.textContent = 'Create & Open Vault';
        }
      }

      createBtn.onclick = submitCreate;
      confirmInput.onkeydown = function (e) {
        if (e.key === 'Enter') { e.preventDefault(); submitCreate(); }
      };
      setTimeout(function () { nameInput.focus(); }, 50);
    }

    // ---- Step 2: master password (optional key file) ----
    function renderStep2(file) {
      ui.clear(card);
      card.append(
        ui.el('h1', {}, 'WebPass'),
        ui.el('p', { class: 'tagline' }, 'Open ' + file.name),
        status,
        ui.el('div', { class: 'file-meta' }, '📁 ' + file.name),
      );

      // optional key file
      const keyInput = ui.el('input', { type: 'file', accept: '.kdbx,.key', class: 'hidden-input' });
      const keyStatus = ui.el('div', { class: 'file-meta' });
      const keyToggle = ui.el('label', { class: 'checkbox' }, [
        ui.el('input', { type: 'checkbox', id: 'kf-toggle' }),
        'Use a key file',
      ]);
      keyToggle.querySelector('#kf-toggle').onchange = function (e) {
        if (e.target.checked) {
          keyInput.click();
        } else {
          state.keyFile = null;
          keyStatus.textContent = '';
        }
      };
      keyInput.onchange = function () {
        const f = keyInput.files && keyInput.files[0];
        if (!f) { return; }
        state.keyFile = f;
        keyStatus.textContent = '🔑 ' + f.name;
      };
      card.append(keyToggle, keyStatus);

      // master password
      const pwd = ui.el('input', { type: 'password', id: 'master-password', placeholder: 'Master password', autocomplete: 'off', autocapitalize: 'off', autocorrect: 'off', spellcheck: false });
      pwd.setAttribute('aria-label', 'Master password');
      card.append(ui.el('div', { class: 'field' }, [
        ui.el('label', { for: 'master-password' }, 'Master password'),
        pwd,
      ]));

      const unlockBtn = ui.el('button', { class: 'btn btn-primary' }, 'Unlock');
      card.append(unlockBtn);

      function submit() {
        const password = pwd.value;
        unlockBtn.disabled = true;
        unlockBtn.textContent = 'Unlocking…';
        status.className = 'status info';
        status.textContent = 'Deriving key and decrypting…';

        const keyFileBuffer = state.keyFile
          ? Promise.resolve().then(function () { return state.keyFile.arrayBuffer(); })
          : Promise.resolve(null);

        keyFileBuffer.then(function (buf) {
          return kdbx.unlock(file.buffer, password, buf);
        }).then(function (db) {
          const defaultId = kdbx.groupUuid(kdbx.defaultGroup(db));
          store.update({
            locked: false,
            db: db,
            header: db.header,
            fileName: file.name,
            handle: file.handle,
            selectedGroupId: null,
            expanded: { [defaultId]: true },
          });
          location.hash = '#/vault';
        }).catch(function (e) {
          status.className = 'status error';
          status.textContent = e && e.message ? e.message : String(e);
          unlockBtn.disabled = false;
          unlockBtn.textContent = 'Unlock';
        });
      }

      unlockBtn.onclick = function () { submit(); };
      pwd.onkeydown = function (e) {
        if (e.key === 'Enter') { e.preventDefault(); submit(); }
      };
      setTimeout(function () { pwd.focus(); }, 0);
    }

    renderStep1();
    return ui.el('div', { class: 'unlock-screen' }, card);
  }

  WP.unlock = { render };
})();
