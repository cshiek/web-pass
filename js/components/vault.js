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

    const saveBtn = ui.el('button', { class: 'btn btn-primary', id: 'save-btn' }, '💾 Save');
    saveBtn.onclick = save;

    const header = ui.el('header', { class: 'vault-header' }, [
      ui.el('span', { class: 'brand' }, 'WebPass'),
      ui.el('span', { class: 'file-name' }, store.state.fileName || ''),
      ui.el('span', { class: 'count', id: 'entry-count' }, ''),
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
      if (!btn) return;
      e.preventDefault();
      copyToClipboard(btn.dataset.copy).then(function (ok) { toast(ok ? 'Copied to clipboard' : 'Copy failed'); });
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
      fieldRow('Username', username, username && copyBtn(username, 'Copy')),
    ];
    rows.push(fieldRow('Password',
      password ? ui.el('span', { class: 'value masked' }, '••••••••') : ui.el('span', { class: 'value muted' }, '—'),
      password && copyBtn(password, 'Copy')));
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

  /* ---- Read-only entry detail ---- */

  function entryDetail(id) {
    const db = store.state.db;
    if (!db) { location.hash = '#/'; return ui.el('div', {}); }
    const entry = kdbx.findEntryById(db, id);
    if (!entry) { return detailShell('Entry not found.'); }

    const rows = [
      fieldRow('Title', kdbx.entryTitle(entry), null),
      fieldRow('Username', kdbx.fieldText(entry, 'U') || '—', kdbx.fieldText(entry, 'U') && copyBtn(kdbx.fieldText(entry, 'U'), 'Copy')),
      fieldRow('Password',
        kdbx.fieldText(entry, 'P') ? ui.el('span', { class: 'value masked' }, '••••••••') : ui.el('span', { class: 'value muted' }, '—'),
        kdbx.fieldText(entry, 'P') && copyBtn(kdbx.fieldText(entry, 'P'), 'Copy')),
    ];

    const website = kdbx.fieldText(entry, 'W');
    if (website) { rows.push(fieldRow('Website', ui.el('a', { class: 'value', href: ensureUrl(website), target: '_blank', rel: 'noopener noreferrer' }, website), null)); }

    const notes = kdbx.fieldText(entry, 'N');
    if (notes) { rows.push(fieldRow('Notes', ui.el('span', { class: 'value notes' }, notes), null)); }

    const customNames = kdbx.customFieldNames(entry);
    for (const name of customNames) {
      const val = entry.fields.get(name);
      const text = val instanceof window.kdbxweb.ProtectedValue ? val.getText() : (val || '');
      rows.push(fieldRow(name, ui.el('span', { class: 'value' }, text || '—'), text && copyBtn(text, 'Copy')));
    }

    const related = ui.el('div', { class: 'muted' }, [
      ui.el('span', {}, 'Group: ' + (entry.parentGroup && entry.parentGroup.name ? entry.parentGroup.name : '')),
    ]);

    return detailShell(ui.el('div', {}, [
      ui.el('h1', {}, kdbx.entryTitle(entry)),
      ui.el('div', { class: 'entry-body' }, rows),
      related,
    ]));
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

  function lock() {
    store.lock();
    location.hash = '#/';
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

  function copyBtn(text, label) {
    return ui.el('button', { class: 'icon-btn', 'data-copy': text }, label || 'Copy');
  }

  function ensureUrl(u) {
    return /^[a-z][a-z0-9+.-]*:\/\//i.test(u) ? 'https://' + u : u;
  }

  function copyToClipboard(text) {
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

  WP.vault = { render, entryDetail };
})();
