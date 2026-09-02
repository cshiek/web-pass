/* vault.js - vault screen: group tree, entry list, read-only entry detail.
 * Attaches to window.WP.vault */
(function () {
  'use strict';

  const WP = window.WP;
  const { ui, store, kdbx } = WP;

  function render() {
    const db = store.state.db;
    if (!db) { location.hash = '#/'; return ui.el('div', {}); }

    const list = ui.el('main', { class: 'entry-list', id: 'entry-list' });
    const search = ui.el('input', { type: 'text', id: 'search', placeholder: 'Search title, username, website', autocomplete: 'off' });

    const lockBtn = ui.el('button', { class: 'btn btn-ghost', id: 'lock-btn' }, '🔒 Lock');
    lockBtn.onclick = lock;

    const newBtn = ui.el('button', { class: 'btn btn-ghost', id: 'new-btn' }, '+ New');
    newBtn.onclick = newEntry;

    const saveBtn = ui.el('button', { class: 'btn btn-primary', id: 'save-btn' }, '💾 Save');
    saveBtn.onclick = save;

    const header = ui.el('header', { class: 'vault-header' }, [
      ui.el('span', { class: 'brand' }, 'WebPass'),
      ui.el('span', { class: 'file-name' }, store.state.fileName || ''),
      ui.el('span', { class: 'count', id: 'entry-count' }, ''),
      newBtn,
      saveBtn,
      lockBtn,
    ]);

    const root = ui.el('div', { class: 'vault' }, [
      header,
      ui.el('div', { class: 'search-bar' }, search),
      ui.el('div', { class: 'vault-body' }, [
        ui.el('nav', { class: 'group-tree', id: 'group-tree' }),
        list,
      ]),
    ]);

    // persistent handlers (these DOM nodes survive re-renders of their children)
    list.addEventListener('click', function (e) {
      const btn = e.target.closest('[data-copy]');
      if (btn) {
        e.preventDefault();
        const field = btn.dataset.field;
        copyToClipboard(btn.dataset.copy, { sensitive: field === 'password' || field === 'username' })
          .then(function (ok) {
            if (ok && btn.dataset.field === 'password') {
              toast('Copied — clears in 30s');
            } else {
              toast(ok ? 'Copied to clipboard' : 'Copy failed');
            }
          });
        return;
      }
      const card = e.target.closest('.entry');
      if (card) { location.hash = '#/vault/' + card.dataset.uuid; }
    });
    search.oninput = function () { renderEntries(search.value); };

    renderTree();
    renderEntries('');
    return root;
  }

  /* ---- Group tree ---- */

  function renderTree() {
    const db = store.state.db;
    if (!db) return;
    const nav = document.getElementById('group-tree');
    if (!nav) return;
    ui.clear(nav);
    nav.append(treeNode(kdbx.defaultGroup(db), kdbx.groupUuid(kdbx.defaultGroup(db)), 0));
  }

  function treeNode(group, groupId, depth) {
    const expanded = !!store.state.expanded[groupId];
    const selected = store.state.selectedGroupId === groupId;

    const toggle = ui.el('button', { class: 'tree-toggle' }, expanded ? '▾' : '▸');
    toggle.onclick = function (e) {
      e.stopPropagation();
      store.update({ expanded: Object.assign({}, store.state.expanded, { [groupId]: !expanded }) });
      renderTree();
    };

    const label = ui.el('button', { class: 'tree-label', 'data-uuid': groupId }, group.name || '(unnamed)');
    if (selected) label.classList.add('selected');
    label.onclick = function () {
      store.update({ selectedGroupId: groupId });
      renderTree();
      renderEntries(searchValue());
    };

    const children = ui.el('div', { class: 'tree-children' });
    if (!expanded) { children.style.display = 'none'; }
    else {
      for (const sub of group.groups) { children.append(treeNode(sub, kdbx.groupUuid(sub), depth + 1)); }
    }

    return ui.el('div', { class: 'tree-node' }, [toggle, label, children]);
  }

  /* ---- Entry list ---- */

  function renderEntries(filterText) {
    const db = store.state.db;
    if (!db) return;
    const list = document.getElementById('entry-list');
    if (!list) return;
    ui.clear(list);

    const q = (filterText || '').toLowerCase().trim();
    let entries;
    if (q) {
      entries = kdbx.allEntries(db).filter(function (e) {
        return kdbx.entryTitle(e).toLowerCase().indexOf(q) > -1
          || kdbx.fieldText(e, 'U').toLowerCase().indexOf(q) > -1
          || kdbx.fieldText(e, 'W').toLowerCase().indexOf(q) > -1;
      });
    } else {
      const group = store.state.selectedGroupId ? db.getGroup(store.state.selectedGroupId) : kdbx.defaultGroup(db);
      entries = group && group.entries ? group.entries : [];
    }

    const countEl = document.getElementById('entry-count');
    if (countEl) countEl.textContent = entries.length + ' entry' + (entries.length === 1 ? '' : 's');

    if (entries.length === 0) {
      list.append(ui.el('div', { class: 'empty' }, q ? 'No entries match your search.' : 'No entries in this group.'));
      return;
    }

    for (const entry of entries) { list.append(entryCard(entry)); }
  }

  function entryCard(entry) {
    const username = kdbx.fieldText(entry, 'U') || '—';
    const password = kdbx.fieldText(entry, 'P');
    const website = kdbx.fieldText(entry, 'W');

    const head = ui.el('div', { class: 'entry-head' }, [
      ui.el('strong', {}, kdbx.entryTitle(entry)),
      ui.el('span', { class: 'muted' }, username),
    ]);

    const rows = [
      fieldRow('Username', username, username && copyBtn(username, 'Copy', 'username')),
    ];
    rows.push(fieldRow('Password',
      password ? ui.el('span', { class: 'value masked' }, '••••••••') : ui.el('span', { class: 'value muted' }, '—'),
      password && copyBtn(password, 'Copy', 'password')));
    if (website) {
      rows.push(fieldRow('Website',
        ui.el('a', { class: 'value', href: ensureUrl(website), target: '_blank', rel: 'noopener noreferrer' }, website),
        null));
    }

    return ui.el('article', { class: 'entry', 'data-uuid': kdbx.entryUuid(entry) }, [head, rows]);
  }

  function fieldRow(labelText, valueNode, actionNode) {
    return ui.el('div', { class: 'field-line' }, [
      ui.el('span', { class: 'label' }, labelText),
      ui.el('span', { class: 'value' }, valueNode),
      actionNode ? ui.el('span', { class: 'action' }, actionNode) : null,
    ]);
  }

  /* ---- Entry editor ---- */

  function entryEditor(id) {
    const db = store.state.db;
    if (!db) { location.hash = '#/'; return ui.el('div', {}); }
    const entry = kdbx.findEntryById(db, id);
    if (!entry) { return detailShell('Entry not found.'); }

    // Working copy of custom fields: { id, name, value, protected }.
    // `id` is the saved field name (or a synthetic 'new-N' for unsaved fields),
    // used to detect renames and deletions on save.
    const customFields = [];
    for (const name of kdbx.customFieldNames(entry)) {
      const val = entry.fields.get(name);
      customFields.push({
        id: name,
        name: name,
        value: val instanceof window.kdbxweb.ProtectedValue ? val.getText() : (val || ''),
        protected: val instanceof window.kdbxweb.ProtectedValue,
      });
    }
    let newSeq = 0;

    const title = ui.el('input', { type: 'text', class: 'editor-field', value: kdbx.fieldText(entry, 'T'), placeholder: 'Title' });
    const username = ui.el('input', { type: 'text', class: 'editor-field', value: kdbx.fieldText(entry, 'U'), placeholder: 'Username' });
    const website = ui.el('input', { type: 'text', class: 'editor-field', value: kdbx.fieldText(entry, 'W'), placeholder: 'https://example.com' });
    const notes = ui.el('textarea', { class: 'editor-field editor-notes', placeholder: 'Notes' });
    notes.value = kdbx.fieldText(entry, 'N');
    const pw = passwordField(kdbx.fieldText(entry, 'P'), function (setValue) {
      openGenerator(setValue);
    });

    const customWrap = ui.el('div', { class: 'custom-fields' });
    function renderCustom() {
      ui.clear(customWrap);
      if (customFields.length === 0) {
        customWrap.append(ui.el('div', { class: 'muted small' }, 'No custom fields yet.'));
      } else {
        for (const cf of customFields) { customWrap.append(customRow(cf)); }
      }
      const addBtn = ui.el('button', { class: 'btn btn-ghost' }, '+ Add field');
      addBtn.onclick = function () {
        customFields.push({ id: 'new-' + (newSeq++), name: '', value: '', protected: false });
        renderCustom();
      };
      customWrap.append(addBtn);
    }
    function customRow(cf) {
      const nameInput = ui.el('input', { type: 'text', class: 'cf-name', value: cf.name, placeholder: 'Name' });
      const valueInput = ui.el('input', { type: cf.protected ? 'password' : 'text', class: 'cf-value', value: cf.value, placeholder: 'Value' });
      const prot = ui.el('input', { type: 'checkbox', title: 'Mask this value' });
      prot.checked = !!cf.protected;
      const del = ui.el('button', { class: 'icon-btn', title: 'Delete field' }, '🗑');
      nameInput.oninput = function () { cf.name = nameInput.value; };
      valueInput.oninput = function () { cf.value = valueInput.value; };
      prot.onchange = function () { cf.protected = prot.checked; valueInput.type = prot.checked ? 'password' : 'text'; };
      del.onclick = function () {
        const i = customFields.indexOf(cf);
        if (i >= 0) customFields.splice(i, 1);
        renderCustom();
      };
      return ui.el('div', { class: 'custom-row' }, [nameInput, valueInput, prot, del]);
    }
    renderCustom();

    const saveBtn = ui.el('button', { class: 'btn btn-primary' }, 'Save');
    const delBtn = ui.el('button', { class: 'btn btn-ghost', style: 'color: var(--danger)' }, 'Delete');
    const back = ui.el('button', { class: 'btn btn-ghost' }, '← Back');
    back.onclick = function () { location.hash = '#/vault'; };
    saveBtn.onclick = saveEntry;
    delBtn.onclick = deleteEntry;

    return ui.el('div', { class: 'vault' }, [
      ui.el('header', { class: 'vault-header' }, [
        ui.el('span', { class: 'brand' }, 'WebPass'),
        ui.el('span', { class: 'file-name' }, store.state.fileName || ''),
        saveBtn, delBtn,
      ]),
      ui.el('div', { class: 'editor-body' }, [
        back,
        ui.el('div', { class: 'editor-form' }, [
          fieldBlock('Title', title),
          fieldBlock('Username', username),
          fieldBlock('Password', pw.wrap),
          fieldBlock('Website', website),
          fieldBlock('Notes', notes),
          ui.el('div', { class: 'editor-section' }, [
            ui.el('h3', { class: 'section-title' }, 'Custom fields'),
            customWrap,
          ]),
        ]),
      ]),
    ]);

    function saveEntry() {
      kdbx.setField(entry, 'T', title.value);
      kdbx.setField(entry, 'U', username.value);
      kdbx.setField(entry, 'P', pw.input.value, true);
      kdbx.setField(entry, 'W', website.value);
      kdbx.setField(entry, 'N', notes.value);
      saveCustomFields(entry, customFields);
      store.markDirty(true);
      toast('Saved');
      renderEntries(searchValue());
      renderTree();
      location.hash = '#/vault';
    }

    function deleteEntry() {
      if (!confirm('Delete this entry?\n\nThis cannot be undone.')) return;
      kdbx.removeEntry(store.state.db, entry);
      store.markDirty(true);
      toast('Entry deleted');
      renderEntries(searchValue());
      location.hash = '#/vault';
    }
  }

  function fieldBlock(labelText, control) {
    return ui.el('div', { class: 'field' }, [ui.el('label', {}, labelText), control]);
  }

  function passwordField(initial, onGenerate) {
    const input = ui.el('input', { type: 'password', class: 'editor-field', value: initial, placeholder: '••••••••' });
    const toggle = ui.el('button', { class: 'icon-btn pw-toggle', title: 'Show/hide password' }, '👁');
    toggle.onclick = function () {
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      toggle.textContent = show ? '👁' : '🙈';
    };
    const gen = ui.el('button', { class: 'icon-btn pw-gen', title: 'Generate password' }, '🎲');
    gen.onclick = function () {
      onGenerate && onGenerate(function (value) {
        input.value = value;
        input.type = 'text';
        toggle.textContent = '🙈';
      });
    };
    const wrap = ui.el('div', { class: 'pw-wrap' }, [input, gen, toggle]);
    return { wrap, input };
  }

  function saveCustomFields(entry, working) {
    const STANDARD = kdbx.STANDARD_FIELDS;
    const DISPLAY = new Set(['Title', 'UserName', 'Password', 'URL', 'Notes']);
    const saved = [];
    entry.fields.forEach(function (_, k) {
      if (!STANDARD.has(k) && !DISPLAY.has(k)) saved.push(k);
    });
    for (const s of saved) {
      if (!working.some(function (f) { return f.id === s || f.name === s; })) {
        entry.fields.delete(s);
      }
    }
    for (const f of working) {
      if (!f.name) continue;
      if (f.id !== f.name) entry.fields.delete(f.id);
      kdbx.setField(entry, f.name, f.value, f.protected);
    }
  }

  /* ---- Password generator ---- */

  function openGenerator(setValue) {
    const opts = Object.assign({}, WP.password.defaults());
    const preview = ui.el('div', { class: 'gen-preview' }, '');
    const lengthVal = ui.el('span', { class: 'gen-val' }, String(opts.length));

    const lengthRange = ui.el('input', { type: 'range', min: 4, max: 64, value: String(opts.length), class: 'gen-range' });
    const lengthNum = ui.el('input', { type: 'number', min: 4, max: 64, value: String(opts.length), class: 'gen-num' });
    lengthRange.oninput = function () { lengthNum.value = lengthRange.value; refresh(); };
    lengthNum.oninput = function () {
      const n = parseInt(lengthNum.value, 10);
      if (!isNaN(n)) { lengthRange.value = Math.min(64, Math.max(4, n)); refresh(); }
    };

    const sets = [
      { cb: ui.el('input', { type: 'checkbox', checked: opts.upper, id: 'gen-upper' }), label: 'Uppercase (A-Z)' },
      { cb: ui.el('input', { type: 'checkbox', checked: opts.lower, id: 'gen-lower' }), label: 'Lowercase (a-z)' },
      { cb: ui.el('input', { type: 'checkbox', checked: opts.digits, id: 'gen-digits' }), label: 'Digits (0-9)' },
      { cb: ui.el('input', { type: 'checkbox', checked: opts.symbols, id: 'gen-symbols' }), label: 'Symbols (!@#$…)' },
    ];
    sets.forEach(function (s) {
      s.cb.onchange = function () {
        if (!sets.some(function (o) { return o.cb.checked; })) { s.cb.checked = true; }
        refresh();
      };
    });

    const ambiguous = ui.el('input', { type: 'checkbox', checked: opts.excludeAmbiguous, id: 'gen-ambiguous' });
    ambiguous.onchange = refresh;

    function refresh() {
      opts.length = parseInt(lengthNum.value, 10) || opts.length;
      opts.upper = sets[0].cb.checked;
      opts.lower = sets[1].cb.checked;
      opts.digits = sets[2].cb.checked;
      opts.symbols = sets[3].cb.checked;
      opts.excludeAmbiguous = ambiguous.checked;
      try { preview.textContent = WP.password.generate(opts); }
      catch (e) { preview.textContent = e.message; }
      lengthVal.textContent = String(opts.length);
    }
    refresh();

    const genBtn = ui.el('button', { class: 'btn btn-ghost' }, '🎲 Generate');
    genBtn.onclick = refresh;
    const applyBtn = ui.el('button', { class: 'btn btn-primary' }, 'Apply');
    const cancelBtn = ui.el('button', { class: 'btn btn-ghost' }, 'Cancel');
    const copyGenBtn = ui.el('button', { class: 'icon-btn' }, 'Copy');

    function close() {
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      document.removeEventListener('keydown', onKey);
    }
    function onKey(e) { if (e.key === 'Escape') close(); }

    applyBtn.onclick = function () {
      let value;
      try { value = WP.password.generate(opts); } catch (e) { value = ''; }
      setValue && setValue(value);
      close();
    };
    cancelBtn.onclick = close;
    copyGenBtn.onclick = function () {
      doCopy(preview.textContent).then(function (ok) { if (ok) toast('Copied to clipboard'); });
    };

    const overlay = ui.el('div', { class: 'modal-overlay' }, [
      ui.el('div', { class: 'modal gen-dialog', role: 'dialog' }, [
        ui.el('div', { class: 'modal-head' }, [
          ui.el('span', { class: 'modal-title' }, 'Password Generator'),
          cancelBtn,
        ]),
        ui.el('div', { class: 'gen-preview-wrap' }, [preview, copyGenBtn]),
        ui.el('div', { class: 'gen-options' }, [
          ui.el('div', { class: 'gen-row' }, [
            ui.el('label', { class: 'gen-len-label' }, 'Length'),
            lengthRange,
            lengthNum,
            lengthVal,
          ]),
          ui.el('div', { class: 'gen-sets' }, sets.map(function (s) {
            return ui.el('label', { class: 'gen-check' }, [s.cb, s.label]);
          })),
          ui.el('label', { class: 'gen-check' }, [ambiguous, 'Exclude ambiguous characters (0, O, o, 1, I, l, 9)']),
        ]),
        ui.el('div', { class: 'modal-actions' }, [genBtn, applyBtn]),
      ]),
    ]);
    document.body.append(overlay);
    document.addEventListener('keydown', onKey);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });
    lengthNum.focus();
  }

  /* ---- CRUD actions ---- */

  function newEntry() {
    const db = store.state.db;
    const group = store.state.selectedGroupId ? db.getGroup(store.state.selectedGroupId) : kdbx.defaultGroup(db);
    const target = group || kdbx.defaultGroup(db);
    const entry = kdbx.createEntry(db, target, { title: '' });
    store.markDirty(true);
    location.hash = '#/vault/' + kdbx.entryUuid(entry);
  }

  function detailShell(inner) {
    const back = ui.el('button', { class: 'btn btn-ghost', id: 'detail-back' }, '← Back');
    back.onclick = function () { location.hash = '#/vault'; };
    return ui.el('div', { class: 'vault' }, [
      ui.el('header', { class: 'vault-header' }, [
        ui.el('span', { class: 'brand' }, 'WebPass'),
        ui.el('span', { class: 'file-name' }, store.state.fileName || ''),
        back,
      ]),
      ui.el('div', { class: 'detail-body' }, inner),
    ]);
  }

  /* ---- Helpers ---- */

  // Pending clipboard-clear timer (30s after a sensitive copy).
  let clipboardClearTimer = null;
  const CLEAR_AFTER_MS = 30000;

  function lock() {
    if (clipboardClearTimer) {
      clearTimeout(clipboardClearTimer);
      clipboardClearTimer = null;
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText('').catch(function () {});
    }
    store.lock();
    location.hash = '#/';
  }

  // Wipe the clipboard after a delay. Coalesces rapid copies into one timer.
  function scheduleClipboardClear() {
    if (clipboardClearTimer) clearTimeout(clipboardClearTimer);
    clipboardClearTimer = setTimeout(function () {
      clipboardClearTimer = null;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText('').catch(function () {});
      }
    }, CLEAR_AFTER_MS);
  }

  async function save() {
    const btn = document.getElementById('save-btn');
    btn.disabled = true;
    btn.textContent = 'Saving…';
    try {
      const result = await WP.save.saveDb(store.state.db);
      toast(result.method === 'fsa'
        ? 'Saved to ' + store.state.fileName
        : 'Downloaded — reopen it to keep working');
    } catch (e) {
      toast('Save failed: ' + (e && e.message ? e.message : e));
    } finally {
      btn.disabled = false;
      btn.textContent = '💾 Save';
    }
  }

  function searchValue() {
    const s = document.getElementById('search');
    return s ? s.value : '';
  }

  function copyBtn(text, label, field) {
    return ui.el('button', { class: 'icon-btn', 'data-copy': text, 'data-field': field || 'text' }, label || 'Copy');
  }

  function ensureUrl(u) {
    return /^[a-z][a-z0-9+.-]*:\/\//i.test(u) ? 'https://' + u : u;
  }

  function copyToClipboard(text, opts) {
    opts = opts || {};
    return new Promise(function (resolve) {
      doCopy(text).then(function (ok) {
        if (ok && opts.sensitive) scheduleClipboardClear();
        resolve(ok);
      });
    });
  }

  function doCopy(text) {
    return new Promise(function (resolve) {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function () { resolve(true); }, function () { resolve(false); });
        return;
      }
      const ta = ui.el('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.top = '-1000px';
      ta.style.opacity = '0';
      document.body.append(ta);
      ta.focus();
      ta.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      document.body.removeChild(ta);
      resolve(ok);
    });
  }

  function toast(msg) {
    const t = ui.el('div', { class: 'toast' }, msg);
    document.body.append(t);
    setTimeout(function () {
      if (t.parentNode) t.parentNode.removeChild(t);
    }, 1500);
  }

  WP.vault = { render, entryEditor };
})();
