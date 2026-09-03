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
    lockBtn.onclick = function () { WP.session.lock(); };

    const newBtn = ui.el('button', { class: 'btn btn-ghost', id: 'new-btn' }, '+ New');
    newBtn.onclick = newEntry;

    const importBtn = ui.el('button', { class: 'btn btn-ghost', id: 'import-btn' }, '📥 Import CSV');
    importBtn.onclick = function () { openCsvImportModal(db); };

    const saveBtn = ui.el('button', { class: 'btn btn-primary', id: 'save-btn' }, '💾 Save');
    saveBtn.onclick = save;

    const header = ui.el('header', { class: 'vault-header' }, [
      ui.el('span', { class: 'brand' }, 'WebPass'),
      ui.el('span', { class: 'file-name' }, store.state.fileName || ''),
      ui.el('span', { class: 'count', id: 'entry-count' }, ''),
      newBtn,
      importBtn,
      saveBtn,
      lockBtn,
    ]);

    const mainArea = ui.el('div', { class: 'entry-pane' }, [
      ui.el('div', { class: 'search-bar' }, search),
      list,
    ]);

    const root = ui.el('div', { class: 'vault' }, [
      header,
      ui.el('div', { class: 'vault-body' }, [
        ui.el('nav', { class: 'group-tree', id: 'group-tree' }),
        mainArea,
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
      if (card) { location.hash = '#/vault/' + encodeURIComponent(card.dataset.uuid); }
    });
    search.oninput = function () { renderEntries(search.value); };

    renderTree(root);
    renderEntries('', root);

    // Inactivity auto-lock: wipe the vault after a period of no interaction.
    WP.session.arm(function () { location.hash = '#/'; });

    return root;
  }

  /* ---- Group tree ---- */

  function renderTree(container) {
    const db = store.state.db;
    if (!db) return;
    const parent = container || document;
    const nav = parent.querySelector ? parent.querySelector('#group-tree') : document.getElementById('group-tree');
    if (!nav) return;
    ui.clear(nav);

    // Sidebar Header: "GROUPS" title + "+ Group" button
    const addGroupBtn = ui.el('button', { class: 'btn btn-ghost', style: 'padding: 2px 6px; font-size: 11px;' }, '+ Group');
    addGroupBtn.onclick = function (e) {
      if (e) { e.stopPropagation(); e.preventDefault(); }
      openCreateGroupModal(db);
    };

    const header = ui.el('div', { class: 'group-tree-header' }, [
      ui.el('span', { class: 'group-tree-title' }, 'Groups'),
      addGroupBtn,
    ]);
    nav.append(header);

    // 1. Recycle Bin (always pinned at top of tree if present)
    const recycleUuid = db.meta && db.meta.recycleBinUuid ? kdbx.uuidStr(db.meta.recycleBinUuid) : null;
    let recycleGroup = null;
    if (recycleUuid) {
      recycleGroup = kdbx.findGroupById(db, recycleUuid);
    }

    if (recycleGroup) {
      const binSelected = store.state.selectedGroupId === recycleUuid;
      const binLabel = ui.el('button', { class: 'tree-label' + (binSelected ? ' selected' : '') }, '🗑️ Recycle Bin');
      binLabel.onclick = function () {
        store.update({ selectedGroupId: recycleUuid });
        renderTree();
        renderEntries(searchValue());
      };
      const dummyToggle = ui.el('span', { class: 'tree-toggle invisible' });
      nav.append(ui.el('div', { class: 'tree-node' }, [ui.el('div', { class: 'tree-item' }, [dummyToggle, binLabel])]));
    }

    // 2. All Entries
    const allSelected = store.state.selectedGroupId === null;
    const allLabel = ui.el('button', { class: 'tree-label' + (allSelected ? ' selected' : '') }, '📁 All Entries');
    allLabel.onclick = function () {
      store.update({ selectedGroupId: null });
      renderTree();
      renderEntries(searchValue());
    };
    const dummyToggle2 = ui.el('span', { class: 'tree-toggle invisible' });
    nav.append(ui.el('div', { class: 'tree-node' }, [ui.el('div', { class: 'tree-item' }, [dummyToggle2, allLabel])]));

    // 3. User Groups (unpack root group children so top-level folders render directly under All Entries)
    const rootGrp = kdbx.defaultGroup(db) || (db.groups && db.groups[0]);
    let topLevelGroups = [];
    if (rootGrp && rootGrp.groups && rootGrp.groups.length > 0) {
      topLevelGroups = rootGrp.groups.filter(function (g) {
        return !recycleUuid || kdbx.groupUuid(g) !== recycleUuid;
      });
    } else if (db.groups) {
      topLevelGroups = db.groups.filter(function (g) {
        return !recycleUuid || kdbx.groupUuid(g) !== recycleUuid;
      });
    }

    for (const top of topLevelGroups) { nav.append(treeNode(top, kdbx.groupUuid(top), 0)); }
  }

  function treeNode(group, groupId, depth) {
    const db = store.state.db;
    const recycleUuid = db && db.meta && db.meta.recycleBinUuid ? kdbx.uuidStr(db.meta.recycleBinUuid) : null;
    const subGroups = (group.groups || []).filter(function (sub) {
      return !recycleUuid || kdbx.groupUuid(sub) !== recycleUuid;
    });
    const hasChildren = subGroups.length > 0;
    const expanded = !!store.state.expanded[groupId];
    const selected = store.state.selectedGroupId === groupId;

    const toggle = ui.el('button', { class: 'tree-toggle' + (hasChildren ? '' : ' invisible') }, expanded ? '▾' : '▸');
    toggle.onclick = function (e) {
      e.stopPropagation();
      store.update({ expanded: Object.assign({}, store.state.expanded, { [groupId]: !expanded }) });
      renderTree();
    };

    const label = ui.el('button', { class: 'tree-label' + (selected ? ' selected' : ''), 'data-uuid': groupId }, group.name || '(unnamed)');
    label.onclick = function () {
      store.update({ selectedGroupId: groupId });
      renderTree();
      renderEntries(searchValue());
    };

    const renameBtn = ui.el('button', { class: 'tree-action-btn', title: 'Rename group' }, '✏️');
    renameBtn.onclick = function (e) {
      e.stopPropagation();
      e.preventDefault();
      openRenameGroupModal(db, group);
    };

    const deleteBtn = ui.el('button', { class: 'tree-action-btn', title: 'Delete group' }, '🗑️');
    deleteBtn.onclick = function (e) {
      e.stopPropagation();
      e.preventDefault();
      confirmDeleteGroup(db, group);
    };

    const actions = ui.el('div', { class: 'tree-item-actions' }, [renameBtn, deleteBtn]);
    const headerItem = ui.el('div', { class: 'tree-item' }, [toggle, label, actions]);

    const children = ui.el('div', { class: 'tree-children' });
    if (!expanded || !hasChildren) {
      children.style.display = 'none';
    } else {
      for (const sub of subGroups) {
        children.append(treeNode(sub, kdbx.groupUuid(sub), depth + 1));
      }
    }

    return ui.el('div', { class: 'tree-node' }, [headerItem, children]);
  }

  /* ---- Entry list ---- */

  function renderEntries(filterText, container) {
    const db = store.state.db;
    if (!db) return;
    const parent = container || document;
    const list = parent.querySelector ? parent.querySelector('#entry-list') : document.getElementById('entry-list');
    if (!list) return;
    ui.clear(list);

    let entries;
    if (store.state.selectedGroupId) {
      const group = kdbx.findGroupById(db, store.state.selectedGroupId);
      entries = group ? kdbx.groupEntries(db, group) : kdbx.allEntries(db);
    } else {
      entries = kdbx.allEntries(db);
    }

    const q = (filterText || '').toLowerCase().trim();
    if (q) {
      entries = entries.filter(function (e) {
        return kdbx.entryTitle(e).toLowerCase().indexOf(q) > -1
          || kdbx.fieldText(e, 'U').toLowerCase().indexOf(q) > -1
          || kdbx.fieldText(e, 'W').toLowerCase().indexOf(q) > -1;
      });
    }

    const countEl = parent.querySelector ? parent.querySelector('#entry-count') : document.getElementById('entry-count');
    if (countEl) countEl.textContent = entries.length + ' entry' + (entries.length === 1 ? '' : 's');

    if (entries.length === 0) {
      list.append(ui.el('div', { class: 'empty' }, q ? 'No entries match your search.' : 'No entries in this group.'));
      return;
    }

    for (const entry of entries) { list.append(entryCard(entry)); }
  }

  function entryCard(entry) {
    const db = store.state.db;
    const username = kdbx.fieldText(entry, 'U') || '—';
    const password = kdbx.fieldText(entry, 'P');
    const website = kdbx.fieldText(entry, 'W');

    const isRecycled = kdbx.inRecycleBin(db, entry);
    const rootGrp = kdbx.defaultGroup(db) || (db && db.groups && db.groups[0]);
    const isRoot = entry.parentGroup && rootGrp && (kdbx.groupUuid(entry.parentGroup) === kdbx.groupUuid(rootGrp));
    const rawGrpName = entry.parentGroup ? entry.parentGroup.name : '';
    const grpName = isRoot ? 'Top Level' : rawGrpName;

    const headElements = [
      ui.el('strong', {}, kdbx.entryTitle(entry)),
    ];

    if (isRecycled) {
      headElements.push(
        ui.el('span', { class: 'group-badge warning' }, '🗑️ Recycle Bin' + (grpName && grpName !== 'Recycle Bin' ? ' (' + grpName + ')' : ''))
      );
    } else if (grpName && (!store.state.selectedGroupId || store.state.selectedGroupId !== kdbx.groupUuid(entry.parentGroup))) {
      headElements.push(
        ui.el('span', { class: 'group-badge' }, '📁 ' + grpName)
      );
    }

    const head = ui.el('div', { class: 'entry-head' }, headElements);

    const rows = [
      fieldRow('Username', username, username && copyBtn(username, 'Copy', 'username')),
    ];
    const pwValueNode = password
      ? ui.el('span', { class: 'value masked' }, '••••••••')
      : null;
    if (pwValueNode) {
      rows.push(fieldRow('Password', pwValueNode,
        [copyBtn(password, 'Copy', 'password'), revealBtn(password, pwValueNode)]));
    }
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

    const isRecycled = kdbx.inRecycleBin(db, entry);

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

    const title = ui.el('input', { type: 'text', class: 'editor-field', value: kdbx.fieldText(entry, 'T'), placeholder: 'Title', disabled: isRecycled });
    const username = ui.el('input', { type: 'text', class: 'editor-field', value: kdbx.fieldText(entry, 'U'), placeholder: 'Username', disabled: isRecycled });
    const website = ui.el('input', { type: 'text', class: 'editor-field', value: kdbx.fieldText(entry, 'W'), placeholder: 'https://example.com', disabled: isRecycled });
    const notes = ui.el('textarea', { class: 'editor-field editor-notes', placeholder: 'Notes', disabled: isRecycled });
    notes.value = kdbx.fieldText(entry, 'N');
    const pw = passwordField(kdbx.fieldText(entry, 'P'), function (setValue) {
      openGenerator(setValue);
    });
    if (isRecycled) { pw.input.disabled = true; }

    const customWrap = ui.el('div', { class: 'custom-fields' });
    function renderCustom() {
      ui.clear(customWrap);
      if (customFields.length === 0) {
        customWrap.append(ui.el('div', { class: 'muted small' }, 'No custom fields yet.'));
      } else {
        for (const cf of customFields) { customWrap.append(customRow(cf)); }
      }
      if (!isRecycled) {
        const addBtn = ui.el('button', { class: 'btn btn-ghost' }, '+ Add field');
        addBtn.onclick = function () {
          customFields.push({ id: 'new-' + (newSeq++), name: '', value: '', protected: false });
          renderCustom();
        };
        customWrap.append(addBtn);
      }
    }
    function customRow(cf) {
      const nameInput = ui.el('input', { type: 'text', class: 'cf-name', value: cf.name, placeholder: 'Name', disabled: isRecycled });
      const valueInput = ui.el('input', { type: cf.protected ? 'password' : 'text', class: 'cf-value', value: cf.value, placeholder: 'Value', disabled: isRecycled });
      const prot = ui.el('input', { type: 'checkbox', title: 'Mask this value', disabled: isRecycled });
      prot.checked = !!cf.protected;
      const del = isRecycled ? null : ui.el('button', { class: 'icon-btn', title: 'Delete field' }, '🗑');
      nameInput.oninput = function () { cf.name = nameInput.value; };
      valueInput.oninput = function () { cf.value = valueInput.value; };
      prot.onchange = function () { cf.protected = prot.checked; valueInput.type = prot.checked ? 'password' : 'text'; };
      if (del) {
        del.onclick = function () {
          const i = customFields.indexOf(cf);
          if (i >= 0) customFields.splice(i, 1);
          renderCustom();
        };
      }
      return ui.el('div', { class: 'custom-row' }, [nameInput, valueInput, prot, del].filter(Boolean));
    }
    renderCustom();

    const back = ui.el('button', { class: 'btn btn-ghost' }, '← Back');
    back.onclick = function () { location.hash = '#/vault'; };

    const headerActions = [];

    if (isRecycled) {
      const restoreBtn = ui.el('button', { class: 'btn btn-primary' }, '♻️ Restore to Edit');
      restoreBtn.onclick = restoreEntryAction;
      const permDelBtn = ui.el('button', { class: 'btn btn-ghost', style: 'color: var(--danger)' }, '🔥 Delete Permanently');
      permDelBtn.onclick = deletePermanentlyAction;
      headerActions.push(restoreBtn, permDelBtn);
    } else {
      const saveBtn = ui.el('button', { class: 'btn btn-primary' }, 'Save');
      saveBtn.onclick = saveEntry;
      const delBtn = ui.el('button', { class: 'btn btn-ghost', style: 'color: var(--danger)' }, 'Delete');
      delBtn.onclick = deleteEntry;
      headerActions.push(saveBtn, delBtn);
    }

    // Group selector
    const allGroups = kdbx.getAllGroups(db);
    const currentGroupUuid = entry.parentGroup ? kdbx.groupUuid(entry.parentGroup) : null;
    const groupSelect = ui.el('select', { class: 'editor-field', disabled: isRecycled });
    for (const gInfo of allGroups) {
      const opt = ui.el('option', { value: gInfo.uuid }, gInfo.label);
      if (gInfo.uuid === currentGroupUuid) opt.selected = true;
      groupSelect.append(opt);
    }

    const editorBodyContent = [back];
    if (isRecycled) {
      editorBodyContent.push(
        ui.el('div', { class: 'status warning', style: 'margin-bottom: 1rem;' },
          'This entry is currently in the Recycle Bin. Restore it to make changes and save.'
        )
      );
    }
    editorBodyContent.push(
      ui.el('div', { class: 'editor-form' }, [
        fieldBlock('Title', title),
        fieldBlock('Group', groupSelect),
        fieldBlock('Username', username),
        fieldBlock('Password', pw.wrap),
        fieldBlock('Website', website),
        fieldBlock('Notes', notes),
        ui.el('div', { class: 'editor-section' }, [
          ui.el('h3', { class: 'section-title' }, 'Custom fields'),
          customWrap,
        ]),
      ])
    );

    return ui.el('div', { class: 'vault' }, [
      ui.el('header', { class: 'vault-header' }, [
        ui.el('span', { class: 'brand' }, 'WebPass'),
        ui.el('span', { class: 'file-name' }, store.state.fileName || ''),
        headerActions,
      ]),
      ui.el('div', { class: 'editor-body' }, editorBodyContent),
    ]);

    function saveEntry() {
      kdbx.setField(entry, 'T', title.value);
      kdbx.setField(entry, 'U', username.value);
      kdbx.setField(entry, 'P', pw.input.value, true);
      kdbx.setField(entry, 'W', website.value);
      kdbx.setField(entry, 'N', notes.value);
      saveCustomFields(entry, customFields);

      const targetGroup = kdbx.findGroupById(db, groupSelect.value);
      if (targetGroup && targetGroup !== entry.parentGroup) {
        kdbx.moveEntry(db, entry, targetGroup);
      }

      store.markDirty(true);
      toast('Entry updated. Click 💾 Save to export changes.');
      location.hash = '#/vault';
    }

    function restoreEntryAction() {
      kdbx.restoreEntry(store.state.db, entry);
      store.markDirty(true);
      toast('Entry restored. You can now edit and save changes.');
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    }

    function deletePermanentlyAction() {
      if (!confirm('Permanently delete this entry?\n\nThis action cannot be undone.')) return;
      kdbx.deletePermanently(store.state.db, entry);
      store.markDirty(true);
      toast('Entry permanently deleted.');
      location.hash = '#/vault';
    }

    function deleteEntry() {
      if (!confirm('Move this entry to the Recycle Bin?')) return;
      kdbx.removeEntry(store.state.db, entry);
      store.markDirty(true);
      toast('Entry moved to Recycle Bin.');
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

  function openCreateGroupModal(db) {
    const nameInput = ui.el('input', { type: 'text', class: 'editor-field', placeholder: 'e.g. Work, Finance, Social', style: 'margin-top: 6px;' });
    const createBtn = ui.el('button', { class: 'btn btn-primary' }, 'Create Group');
    const cancelBtn = ui.el('button', { class: 'btn btn-ghost' }, 'Cancel');

    const recycleUuid = db.meta && db.meta.recycleBinUuid ? kdbx.uuidStr(db.meta.recycleBinUuid) : null;
    const allGroups = kdbx.getAllGroups(db);
    const parentSelect = ui.el('select', { class: 'editor-field', style: 'margin-top: 6px;' });

    const currentSelectedId = store.state.selectedGroupId;
    for (const gInfo of allGroups) {
      const opt = ui.el('option', { value: gInfo.uuid }, gInfo.label);
      if (currentSelectedId) {
        if (gInfo.uuid === currentSelectedId) opt.selected = true;
      } else {
        if (gInfo.isRoot) opt.selected = true;
      }
      parentSelect.append(opt);
    }

    function close() {
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      document.removeEventListener('keydown', onKey);
    }
    function onKey(e) { if (e.key === 'Escape') close(); }

    function submit() {
      const name = nameInput.value.trim();
      if (!name) { toast('Please enter a group name.'); return; }
      try {
        let parentGrp = kdbx.findGroupById(db, parentSelect.value);
        if (!parentGrp || (recycleUuid && kdbx.groupUuid(parentGrp) === recycleUuid)) {
          parentGrp = kdbx.defaultGroup(db) || (db.groups && db.groups[0]);
        }
        const created = kdbx.createGroup(db, parentGrp, name);
        if (created) {
          close();
          const parentUuid = kdbx.groupUuid(parentGrp);
          const newUuid = kdbx.groupUuid(created);

          const newExpanded = Object.assign({}, store.state.expanded, { [parentUuid]: true, [newUuid]: true });
          store.update({ expanded: newExpanded, selectedGroupId: newUuid });

          store.markDirty(true);
          toast('Group "' + name + '" created.');
          renderTree();
          renderEntries();
        }
      } catch (err) {
        console.error('Failed to create group:', err);
        toast('Error creating group: ' + (err.message || String(err)));
      }
    }

    createBtn.onclick = submit;
    cancelBtn.onclick = close;

    const overlay = ui.el('div', { class: 'modal-overlay' }, [
      ui.el('div', { class: 'modal', style: 'max-width: 400px; width: 100%;' }, [
        ui.el('div', { class: 'modal-head' }, [
          ui.el('span', { class: 'modal-title' }, '📁 New Group'),
          cancelBtn,
        ]),
        ui.el('div', { class: 'modal-body', style: 'display: flex; flex-direction: column; gap: 12px; padding: 16px 0;' }, [
          ui.el('div', { class: 'field' }, [
            ui.el('label', { class: 'small muted', style: 'font-weight: 600;' }, 'Group Name'),
            nameInput,
          ]),
          ui.el('div', { class: 'field' }, [
            ui.el('label', { class: 'small muted', style: 'font-weight: 600;' }, 'Parent Group'),
            parentSelect,
          ]),
        ]),
        ui.el('div', { class: 'modal-actions', style: 'margin-top: 16px; display: flex; justify-content: flex-end; gap: 8px;' }, [
          cancelBtn, createBtn
        ]),
      ]),
    ]);

    document.body.append(overlay);
    document.addEventListener('keydown', onKey);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });
    setTimeout(function () { nameInput.focus(); }, 50);
    nameInput.onkeydown = function (e) { if (e.key === 'Enter') submit(); };
  }

  function openRenameGroupModal(db, group) {
    const nameInput = ui.el('input', { type: 'text', class: 'editor-field', value: group.name || '', placeholder: 'Group name', style: 'margin-top: 6px;' });
    const saveBtn = ui.el('button', { class: 'btn btn-primary' }, 'Save Name');
    const cancelBtn = ui.el('button', { class: 'btn btn-ghost' }, 'Cancel');

    function close() {
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      document.removeEventListener('keydown', onKey);
    }
    function onKey(e) { if (e.key === 'Escape') close(); }

    function submit() {
      const name = nameInput.value.trim();
      if (!name) { toast('Group name cannot be empty.'); return; }
      try {
        kdbx.renameGroup(db, group, name);
        store.markDirty(true);
        close();
        toast('Group renamed to "' + name + '".');
        renderTree();
        renderEntries();
      } catch (err) {
        toast('Error renaming group: ' + (err.message || String(err)));
      }
    }

    saveBtn.onclick = submit;
    cancelBtn.onclick = close;

    const overlay = ui.el('div', { class: 'modal-overlay' }, [
      ui.el('div', { class: 'modal', style: 'max-width: 360px; width: 100%;' }, [
        ui.el('div', { class: 'modal-head' }, [
          ui.el('span', { class: 'modal-title' }, '✏️ Rename Group'),
          cancelBtn,
        ]),
        ui.el('div', { class: 'modal-body', style: 'padding: 16px 0;' }, [
          ui.el('div', { class: 'field' }, [
            ui.el('label', { class: 'small muted', style: 'font-weight: 600;' }, 'Group Name'),
            nameInput,
          ]),
        ]),
        ui.el('div', { class: 'modal-actions', style: 'display: flex; justify-content: flex-end; gap: 8px;' }, [
          cancelBtn, saveBtn
        ]),
      ]),
    ]);

    document.body.append(overlay);
    document.addEventListener('keydown', onKey);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });
    setTimeout(function () { nameInput.focus(); nameInput.select(); }, 50);
    nameInput.onkeydown = function (e) { if (e.key === 'Enter') submit(); };
  }

  function confirmDeleteGroup(db, group) {
    const entriesInGrp = kdbx.groupEntries(db, group, true);
    const count = entriesInGrp ? entriesInGrp.length : 0;
    const msg = 'Are you sure you want to delete group "' + (group.name || 'this group') + '"?' +
      (count > 0 ? '\n\n' + count + ' entry/entries inside will be moved to the Recycle Bin.' : '');

    if (!confirm(msg)) return;

    try {
      const gUuid = kdbx.groupUuid(group);
      const isSelected = store.state.selectedGroupId === gUuid;

      kdbx.deleteGroup(db, group);
      store.markDirty(true);

      if (isSelected) {
        store.update({ selectedGroupId: null });
      }

      toast('Group "' + (group.name || '') + '" deleted.');
      renderTree();
      renderEntries();
    } catch (err) {
      toast('Error deleting group: ' + (err.message || String(err)));
    }
  }

  function parseCsv(text) {
    const lines = [];
    let row = [];
    let field = '';
    let inQuotes = false;

    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      const next = text[i + 1];

      if (inQuotes) {
        if (c === '"' && next === '"') {
          field += '"';
          i++;
        } else if (c === '"') {
          inQuotes = false;
        } else {
          field += c;
        }
      } else {
        if (c === '"') {
          inQuotes = true;
        } else if (c === ',') {
          row.push(field);
          field = '';
        } else if (c === '\r') {
          if (next === '\n') i++;
          row.push(field);
          lines.push(row);
          row = [];
          field = '';
        } else if (c === '\n') {
          row.push(field);
          lines.push(row);
          row = [];
          field = '';
        } else {
          field += c;
        }
      }
    }
    if (field || row.length > 0) {
      row.push(field);
      lines.push(row);
    }
    return lines.filter(function (r) {
      return r.some(function (cell) { return cell.trim() !== ''; });
    });
  }

  function mapCsvHeaders(headers) {
    const map = { title: -1, username: -1, password: -1, url: -1, notes: -1, group: -1 };
    headers.forEach(function (h, idx) {
      const clean = h.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
      if (map.title === -1 && ['title', 'name', 'account', 'loginname', 'entryname', 'itemname'].indexOf(clean) !== -1) map.title = idx;
      if (map.username === -1 && ['username', 'user', 'email', 'login', 'loginusername', 'userid'].indexOf(clean) !== -1) map.username = idx;
      if (map.password === -1 && ['password', 'pass', 'secret', 'loginpassword'].indexOf(clean) !== -1) map.password = idx;
      if (map.url === -1 && ['url', 'website', 'web', 'link', 'loginuri', 'uri'].indexOf(clean) !== -1) map.url = idx;
      if (map.notes === -1 && ['notes', 'note', 'comments', 'comment', 'description', 'extra'].indexOf(clean) !== -1) map.notes = idx;
      if (map.group === -1 && ['group', 'folder', 'category', 'groupname', 'foldername'].indexOf(clean) !== -1) map.group = idx;
    });

    if (map.title === -1 && headers.length > 0) map.title = 0;
    if (map.password === -1 && headers.length > 1) {
      for (let i = 0; i < headers.length; i++) {
        if (i !== map.title && i !== map.username && i !== map.url) { map.password = i; break; }
      }
    }
    return map;
  }

  function openCsvImportModal(db) {
    const fileInput = ui.el('input', { type: 'file', accept: '.csv,text/csv,text/plain', class: 'hidden-input' });
    const selectFileBtn = ui.el('button', { class: 'btn btn-primary', style: 'width: 100%; margin-top: 10px;' }, '📄 Select CSV File');
    const cancelBtn = ui.el('button', { class: 'btn btn-ghost' }, 'Cancel');
    const importBtn = ui.el('button', { class: 'btn btn-primary', style: 'display: none;' }, 'Import Entries');

    const statusEl = ui.el('div', { class: 'muted small', style: 'margin-top: 10px; font-weight: 500;' }, 'Select a CSV export file from Chrome, Bitwarden, 1Password, LastPass, KeePass, etc.');

    const recycleUuid = db.meta && db.meta.recycleBinUuid ? kdbx.uuidStr(db.meta.recycleBinUuid) : null;
    const allGroups = kdbx.getAllGroups(db);
    const parentSelect = ui.el('select', { class: 'editor-field', style: 'margin-top: 6px;' });

    const currentSelectedId = store.state.selectedGroupId;
    for (const gInfo of allGroups) {
      const opt = ui.el('option', { value: gInfo.uuid }, gInfo.label);
      if (currentSelectedId) {
        if (gInfo.uuid === currentSelectedId) opt.selected = true;
      } else {
        if (gInfo.isRoot) opt.selected = true;
      }
      parentSelect.append(opt);
    }

    const mappingContainer = ui.el('div', { style: 'display: none; flex-direction: column; gap: 8px; margin-top: 12px;' });

    let parsedRows = [];
    let csvHeaders = [];
    let detectedMapping = {};

    function close() {
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      document.removeEventListener('keydown', onKey);
    }
    function onKey(e) { if (e.key === 'Escape') close(); }

    selectFileBtn.onclick = function () { fileInput.click(); };

    fileInput.onchange = function () {
      const file = fileInput.files && fileInput.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = function (e) {
        try {
          const text = e.target.result;
          const rows = parseCsv(text);
          if (rows.length < 2) {
            statusEl.textContent = '❌ CSV file appears empty or has no data rows.';
            statusEl.style.color = 'var(--danger, #ef4444)';
            return;
          }

          csvHeaders = rows[0];
          parsedRows = rows.slice(1);
          detectedMapping = mapCsvHeaders(csvHeaders);

          statusEl.textContent = '✓ Found ' + parsedRows.length + ' entries in "' + file.name + '". Verify column mapping below:';
          statusEl.style.color = 'var(--accent, #3b82f6)';

          selectFileBtn.style.display = 'none';
          importBtn.style.display = 'inline-block';
          importBtn.textContent = 'Import ' + parsedRows.length + ' Entries';

          renderMappingSelectors();
        } catch (err) {
          console.error('CSV parse error:', err);
          statusEl.textContent = '❌ Failed to parse CSV: ' + (err.message || String(err));
          statusEl.style.color = 'var(--danger, #ef4444)';
        }
      };
      reader.readAsText(file);
    };

    function renderMappingSelectors() {
      ui.clear(mappingContainer);
      mappingContainer.style.display = 'flex';

      const fields = [
        { key: 'title', label: 'Title / Account Name' },
        { key: 'username', label: 'Username / Email' },
        { key: 'password', label: 'Password' },
        { key: 'url', label: 'Website / URL' },
        { key: 'notes', label: 'Notes' },
        { key: 'group', label: 'Group / Folder (Optional)' },
      ];

      fields.forEach(function (f) {
        const sel = ui.el('select', { class: 'editor-field', style: 'padding: 4px 8px; font-size: 12px;' });
        const noneOpt = ui.el('option', { value: '-1' }, '-- Ignore --');
        sel.append(noneOpt);

        csvHeaders.forEach(function (h, idx) {
          const opt = ui.el('option', { value: String(idx) }, h.trim() || ('Column ' + (idx + 1)));
          if (detectedMapping[f.key] === idx) opt.selected = true;
          sel.append(opt);
        });

        sel.onchange = function () {
          detectedMapping[f.key] = parseInt(sel.value, 10);
        };

        const row = ui.el('div', { style: 'display: flex; justify-content: space-between; align-items: center; gap: 8px;' }, [
          ui.el('span', { class: 'small muted', style: 'min-width: 140px;' }, f.label),
          sel,
        ]);
        mappingContainer.append(row);
      });
    }

    importBtn.onclick = function () {
      if (!parsedRows || parsedRows.length === 0) return;
      importBtn.disabled = true;
      importBtn.textContent = 'Importing…';

      try {
        let defaultParentGrp = kdbx.findGroupById(db, parentSelect.value);
        if (!defaultParentGrp || (recycleUuid && kdbx.groupUuid(defaultParentGrp) === recycleUuid)) {
          defaultParentGrp = kdbx.defaultGroup(db) || (db.groups && db.groups[0]);
        }

        let importedCount = 0;
        parsedRows.forEach(function (row) {
          const getVal = function (idxKey) {
            const idx = detectedMapping[idxKey];
            if (idx != null && idx >= 0 && idx < row.length) {
              return (row[idx] || '').trim();
            }
            return '';
          };

          const title = getVal('title') || 'Imported Entry';
          const username = getVal('username');
          const password = getVal('password');
          const url = getVal('url');
          const notes = getVal('notes');
          const grpName = getVal('group');

          let targetGroup = defaultParentGrp;
          if (grpName) {
            targetGroup = kdbx.getOrCreateGroupByName(db, defaultParentGrp, grpName);
          }

          kdbx.createEntry(db, targetGroup, { title, username, password, url, notes });
          importedCount++;
        });

        store.markDirty(true);
        close();
        toast('Successfully imported ' + importedCount + ' entries!');
        renderTree();
        renderEntries();
      } catch (err) {
        console.error('Import failed:', err);
        toast('Error importing CSV: ' + (err.message || String(err)));
        importBtn.disabled = false;
        importBtn.textContent = 'Import ' + parsedRows.length + ' Entries';
      }
    };

    cancelBtn.onclick = close;

    const overlay = ui.el('div', { class: 'modal-overlay' }, [
      ui.el('div', { class: 'modal', style: 'max-width: 480px; width: 100%;' }, [
        ui.el('div', { class: 'modal-head' }, [
          ui.el('span', { class: 'modal-title' }, '📥 Import Passwords from CSV'),
          cancelBtn,
        ]),
        ui.el('div', { class: 'modal-body', style: 'display: flex; flex-direction: column; gap: 10px; padding: 16px 0; max-height: 70vh; overflow-y: auto;' }, [
          statusEl,
          selectFileBtn,
          fileInput,
          ui.el('div', { class: 'field', style: 'margin-top: 8px;' }, [
            ui.el('label', { class: 'small muted', style: 'font-weight: 600;' }, 'Target Parent Group'),
            parentSelect,
          ]),
          mappingContainer,
        ]),
        ui.el('div', { class: 'modal-actions', style: 'margin-top: 16px; display: flex; justify-content: flex-end; gap: 8px;' }, [
          cancelBtn, importBtn
        ]),
      ]),
    ]);

    document.body.append(overlay);
    document.addEventListener('keydown', onKey);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });
  }

  /* ---- CRUD actions ---- */

  function newEntry() {
    const db = store.state.db;
    const group = store.state.selectedGroupId ? db.getGroup(store.state.selectedGroupId) : kdbx.defaultGroup(db);
    const target = group || kdbx.defaultGroup(db);
    const entry = kdbx.createEntry(db, target, { title: '' });
    store.markDirty(true);
    location.hash = '#/vault/' + encodeURIComponent(kdbx.entryUuid(entry));
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

  async function save() {
    const btn = document.getElementById('save-btn');
    btn.disabled = true;
    btn.textContent = 'Saving…';
    try {
      const res = await WP.save.saveDb(store.state.db);
      if (res && res.method === 'cancelled') {
        toast('Save cancelled.');
      } else if (res && res.method === 'file') {
        toast('Vault saved successfully!');
      } else {
        toast('Vault saved & exported.');
      }
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

  // Toggle the password value between masked dots and plaintext in `valueNode`.
  // stopPropagation keeps the click from bubbling to the vault list handler,
  // which would otherwise open the entry card.
  function revealBtn(password, valueNode) {
    const btn = ui.el('button', { class: 'icon-btn pw-reveal', title: 'Show password' }, '👁');
    btn.onclick = function (e) {
      e.stopPropagation();
      if (btn.dataset.revealed === 'true') {
        valueNode.textContent = '••••••••';
        btn.textContent = '👁';
        btn.title = 'Show password';
        delete btn.dataset.revealed;
      } else {
        valueNode.textContent = password;
        btn.textContent = '🙈';
        btn.title = 'Hide password';
        btn.dataset.revealed = 'true';
      }
    };
    return btn;
  }

  function ensureUrl(u) {
    return /^[a-z][a-z0-9+.-]*:\/\//i.test(u) ? u : 'https://' + u;
  }

  function copyToClipboard(text, opts) {
    opts = opts || {};
    return new Promise(function (resolve) {
      doCopy(text).then(function (ok) {
        if (ok && opts.sensitive) WP.session.scheduleClipboardClear();
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
