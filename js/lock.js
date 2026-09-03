/* lock.js - session lifecycle: inactivity auto-lock, tab-close wipe,
 * unsaved-changes guard, manual lock, and clipboard clearing.
 * Attaches to window.WP.session */
(function () {
  'use strict';

  const WP = window.WP;
  const STORE = WP.store;

  // Auto-lock after this many ms of inactivity while the vault is visible.
  const DEFAULT_AUTO_LOCK_MS = 10 * 60 * 1000; // 10 minutes (design.md §9)
  // Sensitive copies (password/username) are wiped from the clipboard after this.
  const CLEAR_AFTER_MS = 30000; // 30 seconds

  // Events that count as the user being present (reset the inactivity timer).
  const ACTIVITY_EVENTS = ['keydown', 'mousemove', 'pointerdown', 'touchstart', 'wheel'];
  // Events that reset the timer even while the tab is backgrounded are
  // intentionally excluded — a hidden tab is treated as unattended.

  let timer = null;          // inactivity auto-lock timer
  let clipboardTimer = null; // separate timer for the timed clipboard wipe
  let active = false;
  let onManualLock = null; // vault callback, e.g. navigate to '#/'

  function currentTimeout() {
    const overridden = STORE.state.autoLockMs;
    return (overridden && overridden > 0) ? overridden : DEFAULT_AUTO_LOCK_MS;
  }

  function clearClipboardNow() {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText('').catch(function () { /* best effort */ });
    }
  }

  function clearMemory() {
    stopTracking();
    clearClipboardNow();
    // Drop the decrypted database and reset session state completely (design.md §5.3).
    STORE.lock();
  }

  function stopTracking() {
    active = false;
    if (timer) { clearTimeout(timer); timer = null; }
    ACTIVITY_EVENTS.forEach(function (ev) { window.removeEventListener(ev, onActivity); });
  }

  function onActivity() {
    if (!active) return;
    if (document.visibilityState === 'hidden') return;
    resetTimer();
  }

  function resetTimer() {
    if (timer) clearTimeout(timer);
    timer = setTimeout(fire, currentTimeout());
  }

  // About to lock the vault (manual Lock button or inactivity timer). If there
  // are unsaved changes, warn and reset the timer so the user can save; the
  // vault stays open. Returns true if it handled things and the caller should
  // skip locking.
  function guardUnsavedOnLock() {
    if (STORE.state.dirty) {
      window.alert('You have unsaved changes. Save before locking?');
      resetTimer();
      return true;
    }
    return false;
  }

  function fire() {
    if (guardUnsavedOnLock()) return;
    clearMemory();
    if (onManualLock) onManualLock();
  }

  // Start inactivity tracking. `manualLock` is invoked when the vault locks
  // (either by inactivity or via the manual Lock button).
  function arm(manualLock) {
    stopTracking();
    onManualLock = manualLock || null;
    active = true;
    ACTIVITY_EVENTS.forEach(function (ev) { window.addEventListener(ev, onActivity, { passive: true }); });
    resetTimer();
  }

  // Manual lock (Lock button): wipe and hand off to the vault callback, unless
  // there are unsaved changes (see guardUnsavedOnLock).
  function lock() {
    if (guardUnsavedOnLock()) return;
    clearMemory();
    if (onManualLock) onManualLock();
  }

  // Wipe memory without navigating. Called on tab hidden / page close.
  function suspend() {
    clearMemory();
  }

  // Schedule a timed wipe of the clipboard after a sensitive copy. Uses a
  // dedicated timer so it never disturbs the inactivity auto-lock timer.
  function scheduleClipboardClear() {
    if (clipboardTimer) clearTimeout(clipboardTimer);
    clipboardTimer = setTimeout(function () {
      clipboardTimer = null;
      clearClipboardNow();
    }, CLEAR_AFTER_MS);
  }

  function guardUnsaved(e) {
    if (!STORE.state.dirty) return;
    e.preventDefault();
    e.returnValue = 'You have unsaved changes. Save before leaving?';
    return 'You have unsaved changes. Save before leaving?';
  }

  // Bootstrap: wire the one-time global session events.
  function init() {
    // Wipe decrypted memory if the page is closed / torn down.
    window.addEventListener('pagehide', suspend);
    // Warn before leaving with unsaved changes.
    window.addEventListener('beforeunload', guardUnsaved);
  }

  WP.session = {
    init, arm, lock, suspend, scheduleClipboardClear,
    defaults: { autoLockMs: DEFAULT_AUTO_LOCK_MS, clearAfterMs: CLEAR_AFTER_MS },
  };
})();
