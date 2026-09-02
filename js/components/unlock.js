/* unlock.js - unlock screen component. Attaches to window.WP.unlock */
(function () {
  'use strict';

  const WP = window.WP;
  const { ui, store, kdbx } = WP;

  // Returns a DOM node for the unlock screen.
  function render() {
    const state = { file: null, keyFile: null };

    const status = ui.el('div', { class: 'status info', role: 'status' });
    const card = ui.el('div', {}, [
      ui.el('h1', {}, 'WebPass'),
      ui.el('p', { class: 'tagline' }, 'Portable KeePass vault'),
      status,
    ]);

    // ---- Step 1: open the .kdbx file ----
    const openBtn = ui.el('button', { class: 'btn btn-primary' }, 'Open .kdbx file');
    openBtn.onclick = async function () {
      status.className = 'status info';
      status.textContent = '';
      try {
        const opened = await kdbx.openFile();
        state.file = opened;
        renderStep2();
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
    card.append(openBtn);
    return ui.el('div', { class: 'unlock-screen' }, card);

    // ---- Step 2: master password (optional key file) ----
    function renderStep2() {
      ui.clear(card);
      card.append([
        ui.el('h1', {}, 'WebPass'),
        ui.el('p', { class: 'tagline' }, 'Open ' + state.file.name),
        status,
        ui.el('div', { class: 'file-meta' }, '📁 ' + state.file.name),
      ]);

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
          return kdbx.unlock(state.file.buffer, password, buf);
        }).then(function (db) {
          const defaultId = kdbx.groupUuid(kdbx.defaultGroup(db));
          store.update({
            locked: false,
            db: db,
            header: db.header,
            fileName: state.file.name,
            handle: state.file.handle,
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
  }

  WP.unlock = { render };
})();
